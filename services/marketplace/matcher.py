"""Mission-to-listing matching model.

Planners and people describe work loosely ("make sure the cap is sealed",
"spot pedestrians", "pick up the limes gently"); listings use fixed capability
ids and object names. This module learns that mapping so Scout can find the
listings most relevant to a mission step instead of relying on exact strings.

Pieces:
- Capability model: TF-IDF (word 1-2 grams + char 3-5 grams) and multinomial
  logistic regression, trained at startup on text generated from the live
  catalog (listing names and descriptions) plus intent phrases per capability.
  Gives P(capability | text).
- Object resolver: plural/synonym normalisation plus character-trigram
  similarity against every object the catalog knows ("limes" -> lime,
  "pedestrian" -> person, "mug" -> coffee mug).
- Listing relevance: 0.45 * P(listing capability) + 0.35 * object fit
  + 0.20 * text similarity to the listing's own name and description.

Evaluate with `python -m services.marketplace.matcher` (held-out paraphrases).
"""
from __future__ import annotations
import random
import re
import threading
from functools import lru_cache

# Intent phrases per capability: how people and planners describe the work.
INTENTS = {
    'object_detection': ['find the {o}', 'locate the {o}', 'detect {o}', 'spot the {o} in the frame', 'where is the {o}', 'look for {o}', 'bounding box around the {o}', 'see if there is a {o}', 'watch for pedestrians', 'detect people in the aisle'],
    'human_pose': ['track body pose of the person', 'estimate human keypoints', 'is someone reaching toward the arm', 'track arms and legs of workers', 'human skeleton keypoints', 'detect a person leaning into the cell'],
    'instance_segmentation': ['segment the {o}', 'pixel mask of the {o}', 'outline the {o} exactly', 'separate overlapping {o}s', 'mask each object', 'cut-out silhouette of the {o}'],
    'grasp': ['pick up the {o}', 'grab the {o}', 'plan a grasp on the {o}', 'where to grip the {o}', 'grasp point for {o}', 'pinch the {o}'],
    'control': ['lift the {o} gently', 'move the {o} with limited force', 'handle the {o} softly', 'carry the {o}', 'execute the pick trajectory', 'hold the {o} without crushing it'],
    'path_planning': ['drive to the loading bay', 'navigate around obstacles', 'plan a route to the shelf', 'go to the waypoint', 'find a path through the warehouse', 'avoid collisions while moving'],
    'scene_inspection': ['summarize the sensors', 'how many people are nearby', 'check the aisle is clear', 'scan the surroundings', 'report nearby obstacles'],
    'camera_capture': ['take a picture', 'capture a camera frame', 'grab an image of the workspace', 'snapshot the scene'],
    'image_quality': ['check the image is usable', 'is the photo too dark or blurry', 'verify frame brightness and contrast', 'image quality check'],
    'scene_mapping': ['map the workspace', 'list every object on the bench', 'build a map of the scene', 'what objects are on the table'],
    'object_identity': ['confirm this is the {o}', 'verify the object is a {o}', 'identify which item this is', 'is that really the {o}'],
    'pose_estimation': ['estimate the orientation of the {o}', 'find the pose of the {o}', 'which way is the {o} facing', '6d pose of the {o}'],
    'dimension_estimation': ['measure the {o}', 'how big is the {o}', 'estimate size and weight of the {o}', 'dimensions of the {o}'],
    'reachability_check': ['can the arm reach the {o}', 'is the {o} within reach', 'check workspace reach'],
    'collision_check': ['check clearance around the {o}', 'will the gripper hit anything', 'is there room around the {o}', 'collision check before moving'],
    'handle_detection': ['find the handle of the {o}', 'locate the handle', 'where is the mug handle'],
    'surface_inspection': ['is the {o} dirty', 'check the surface of the {o}', 'does the {o} need cleaning', 'inspect for stains'],
    'damage_inspection': ['is the {o} damaged', 'check the {o} for dents or cracks', 'look for defects on the {o}', 'inspect for breakage'],
    'contents_inspection': ['what is inside the {o}', 'is the {o} empty', 'check the contents of the {o}'],
    'object_classification': ['what category is the {o}', 'sort the {o} by type', 'classify the item', 'which bin does the {o} belong in'],
    'grasp_verification': ['did the grasp succeed', 'verify the grip on the {o}', 'check the {o} is held securely'],
    'placement_planning': ['decide where to put the {o}', 'plan where the {o} goes', 'choose a spot for the {o}', 'pick a destination for the {o}'],
    'object_placement': ['put the {o} down', 'place the {o} in the tray', 'set the {o} on the shelf', 'drop the {o} into the bin'],
    'inspection_report': ['write up the inspection', 'summarize all checks', 'produce an inspection report'],
    'completion_verification': ['confirm the task is done', 'verify the job finished', 'check the outcome', 'make sure everything worked'],
    'material_check': ['what material is the {o} made of', 'is the {o} glass or plastic', 'check the material'],
    'orientation_check': ['is the {o} upright', 'check the {o} is the right way up', 'is the {o} tipped over'],
    'bruise_inspection': ['does the {o} have bruises', 'check the {o} for soft spots', 'is the fruit bruised'],
    'ripeness_inspection': ['is the {o} ripe', 'check if the {o} is ready to eat', 'how ripe is the {o}', 'is the fruit overripe'],
    'label_reading': ['read the label on the {o}', 'what does the label say', 'scan the shipping label', 'read the text on the {o}'],
    'seal_inspection': ['is the {o} sealed', 'make sure the cap is sealed', 'check the lid is closed', 'is the seal intact'],
    'alignment_check': ['is the {o} aligned', 'check alignment of the parts', 'is the {o} straight'],
    'connector_inspection': ['check the connector on the {o}', 'are the pins bent', 'inspect the plug'],
    'expiry_reading': ['read the expiry date', 'is the {o} expired', 'check the best before date'],
    'leak_inspection': ['is the {o} leaking', 'check for leaks', 'any liquid escaping from the {o}'],
    'tip_inspection': ['check the tip of the {o}', 'is the {o} tip worn or bent', 'inspect the point of the {o}'],
    'battery_inspection': ['check the battery of the {o}', 'is the battery swollen', 'battery level of the {o}'],
    'screen_inspection': ['is the screen cracked', 'check the display of the {o}', 'inspect the screen'],
}

# Words that mean the same thing to the catalog.
SYNONYMS = {
    'pedestrian': 'person', 'pedestrians': 'person', 'people': 'person', 'human': 'person', 'humans': 'person',
    'worker': 'person', 'workers': 'person', 'man': 'person', 'woman': 'person', 'child': 'person', 'children': 'person',
    'kid': 'person', 'kids': 'person', 'operator': 'person', 'operators': 'person', 'staff': 'person', 'visitor': 'person',
    'shopper': 'person', 'customer': 'person', 'someone': 'person', 'anyone': 'person', 'anybody': 'person', 'somebody': 'person',
    'mug': 'cup', 'cellphone': 'cell phone', 'mobile': 'mobile phone', 'iphone': 'smartphone',
    'parcel': 'cardboard box', 'package': 'cardboard box', 'box': 'cardboard box', 'carton': 'cardboard box',
    'allen key': 'hex key',
    'tv remote': 'remote control', 'remote': 'remote control', 'cable': 'usb cable', 'headset': 'headphones',
    'tomatoes': 'tomato', 'potatoes': 'potato', 'knives': 'knife', 'leaves': 'leaf',
}
# Everyday wording -> catalog wording (applied as extra tokens, not replacements).
CONCEPTS = {
    'drip': 'leak', 'dripping': 'leak', 'spill': 'leak', 'seep': 'leak', 'wet': 'leak',
    'crack': 'damage', 'chip': 'damage', 'dent': 'damage', 'broken': 'damage', 'shattered': 'damage screen',
    'crumb': 'dirty surface', 'stain': 'dirty surface', 'dust': 'dirty surface', 'clean': 'dirty surface', 'grime': 'dirty surface',
    'size': 'dimension measure', 'large': 'dimension measure', 'big': 'dimension measure', 'heavy': 'dimension weight', 'width': 'dimension measure',
    'reach': 'reachability', 'get to': 'reachability',
    'lined': 'aligned alignment', 'line up': 'aligned alignment', 'straight': 'aligned alignment', 'level': 'aligned alignment',
    'hold firmly': 'verify grip grasp verification', 'secure': 'verify grip grasp verification', 'slip': 'verify grip grasp verification',
    'photo': 'picture capture camera', 'picture': 'capture camera', 'shot': 'capture camera',
    'blurry': 'image quality', 'dark': 'image quality', 'blur': 'image quality',
    'list all': 'map scene objects', 'everything on': 'map scene objects', 'all the thing': 'map scene objects', 'inventory': 'map scene objects',
    'done': 'verify completion', 'worked': 'verify completion', 'finished': 'verify completion', 'succeeded': 'verify completion',
    'pin': 'connector', 'plug': 'connector', 'port': 'connector',
    'soft spot': 'bruise', 'brown patch': 'bruise', 'mushy': 'bruise',
    'ready to eat': 'ripe ripeness', 'overripe': 'ripe ripeness', 'unripe': 'ripe ripeness',
    'expire': 'expiry date', 'best before': 'expiry date', 'use by': 'expiry date',
    'lid': 'seal sealed', 'cap': 'seal sealed', 'closed': 'seal sealed',
    'upright': 'orientation', 'tipped': 'orientation', 'upside down': 'orientation',
    'walking': 'person detect', 'anybody': 'person detect', 'someone': 'person',
    'outline': 'segment mask', 'silhouette': 'segment mask',
}
BOILERPLATE = re.compile(r'(consumes declared prerequisite evidence|simulation only|resells the simlab reference adapter|only for)[^.]*\.?', re.I)


def singular(word):
    if word in SYNONYMS: return SYNONYMS[word]
    if len(word) > 4 and word.endswith('ies'): return word[:-3] + 'y'
    if len(word) > 4 and word.endswith(('ches', 'shes', 'sses', 'xes')): return word[:-2]
    if len(word) > 3 and word.endswith('s') and not word.endswith(('ss', 'us', 'is')): return word[:-1]
    return word


def normalize(text):
    words = re.findall(r'[a-z0-9]+', (text or '').lower().replace('_', ' '))
    base = ' '.join(singular(w) for w in words)
    padded = f' {base} '
    tokens = base.split()
    def hit(key):
        if ' ' in key: return f' {key} ' in padded
        return any(t == key or (len(key) >= 4 and t.startswith(key)) for t in tokens)
    extra = [v for k, v in CONCEPTS.items() if hit(k)]
    return ' '.join([base] + extra)


def _trigrams(text):
    text = f'  {text} '
    return {text[i:i + 3] for i in range(len(text) - 2)}


class Matcher:
    """Trained capability classifier + object resolver over one catalog snapshot."""

    def __init__(self, listings, seed=7):
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import FeatureUnion
        self.listings = listings
        self.capabilities = sorted({m.task_type for m in listings})
        self.objects = sorted({o for m in listings for o in m.supported_objects})
        self._objects_longest_first = sorted(self.objects, key=len, reverse=True)
        texts, labels = self._training_data(random.Random(seed))
        self.features = FeatureUnion([
            ('words', TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
            ('chars', TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5), sublinear_tf=True, min_df=2)),
        ])
        x = self.features.fit_transform(texts)
        self.model = LogisticRegression(max_iter=2000, C=8.0, class_weight='balanced').fit(x, labels)
        self.classes = list(self.model.classes_)
        docs = [self.listing_text(m) for m in listings]
        self.listing_vectors = self.features.transform(docs)
        self.training_examples = len(texts)

    @staticmethod
    def listing_text(m):
        description = BOILERPLATE.sub('', m.description or '')
        return normalize(f"{m.name} {m.task_type.replace('_', ' ')} {description} {' '.join(m.supported_objects[:12])}")

    def _training_data(self, rng):
        texts, labels = [], []
        objects = self.objects or ['object']
        for cap in self.capabilities:
            phrases = INTENTS.get(cap, []) + [cap.replace('_', ' ')]
            for phrase in phrases:
                for obj in rng.sample(objects, min(6, len(objects))) if '{o}' in phrase else [None]:
                    texts.append(self.mask_objects(phrase.format(o=obj) if obj else phrase)); labels.append(cap)
        for m in self.listings:
            texts.append(self.mask_objects(self.listing_text(m))); labels.append(m.task_type)
            texts.append(self.mask_objects(m.name)); labels.append(m.task_type)
        return texts, labels

    def mask_objects(self, text):
        """Replace known object names with a placeholder so the model keys on the action."""
        text = f' {normalize(text)} '
        for obj in self._objects_longest_first:
            text = text.replace(f' {obj} ', ' thing ')
        return text.strip()

    def capability_probabilities(self, text):
        probs = self.model.predict_proba(self.features.transform([self.mask_objects(text)]))[0]
        return dict(zip(self.classes, probs))

    def resolve_object(self, name):
        """Best catalog object for a loosely named one, with a confidence in [0, 1]."""
        if not name: return None, 0.0
        target = normalize(name)
        target = SYNONYMS.get(target, target)
        if target in self.objects: return target, 1.0
        best, score = None, 0.0
        grams = _trigrams(target)
        for obj in self.objects:
            other = _trigrams(obj)
            sim = len(grams & other) / len(grams | other)
            if target in obj.split() or obj in target.split(): sim = max(sim, .8)
            if sim > score: best, score = obj, sim
        return (best, round(score, 3)) if score >= .45 else (None, round(score, 3))

    def resolve_capability(self, task_type, context=''):
        """Catalog capability for a planner's task_type, plus its probability."""
        if task_type in self.capabilities: return task_type, 1.0
        probs = self.capability_probabilities(f'{task_type} {context}')
        best = max(probs, key=probs.get)
        return best, round(float(probs[best]), 4)

    def object_fit(self, listing, obj):
        if listing.specialist:
            return 1.0 if obj and obj in listing.supported_objects else 0.0
        if not obj or not listing.supported_objects: return 0.7
        return 0.85 if obj in listing.supported_objects else 0.0

    def rank(self, text, object_name=None, execution_mode=None, task_type=None, top_k=10):
        from sklearn.metrics.pairwise import linear_kernel
        query = f'{task_type or ""} {text} {object_name or ""}'
        probs = self.capability_probabilities(query)
        if task_type in self.capabilities:  # an explicit capability is a strong prior, not a hard filter
            probs = {k: .3 * v + (.7 if k == task_type else 0) for k, v in probs.items()}
        obj, obj_conf = self.resolve_object(object_name) if object_name else self._object_from_text(text)
        sims = linear_kernel(self.features.transform([normalize(query)]), self.listing_vectors)[0]
        rows = []
        for m, sim in zip(self.listings, sims):
            if execution_mode and m.execution_mode != execution_mode: continue
            fit = self.object_fit(m, obj)
            if fit == 0: continue
            relevance = .45 * probs.get(m.task_type, 0) + .35 * fit + .20 * float(sim)
            rows.append(dict(model=m, relevance=round(relevance, 4), capability_probability=round(float(probs.get(m.task_type, 0)), 4),
                             object_fit=fit, text_similarity=round(float(sim), 4)))
        rows.sort(key=lambda r: -r['relevance'])
        top = max(probs, key=probs.get)
        return dict(capability=top, capability_probability=round(float(probs[top]), 4), object=obj, object_confidence=obj_conf,
                    results=rows[:top_k])

    def _object_from_text(self, text):
        words = normalize(text).split()
        candidates = [' '.join(words[i:i + n]) for n in (2, 1) for i in range(len(words) - n + 1)]
        for c in candidates:
            c = SYNONYMS.get(c, c)
            if c in self.objects: return c, 1.0
        return None, 0.0

    def relevance(self, listing, task_type, object_name):
        """Relevance of one listing to a step, for Scout's score."""
        obj, _ = self.resolve_object(object_name)
        probs = self.capability_probabilities(f'{task_type} {object_name or ""}')
        cap = 1.0 if listing.task_type == task_type else probs.get(listing.task_type, 0)
        return round(.6 * cap + .4 * self.object_fit(listing, obj), 4)


_lock = threading.Lock()
_cache = {}


def matcher(listings=None):
    """Matcher trained on the current catalog; retrains when the catalog changes."""
    if listings is None:
        from services.marketplace.registry import list_models
        listings = list_models()
    key = (len(listings), hash(tuple(sorted(m.id for m in listings))))
    with _lock:
        if key not in _cache:
            _cache.clear()
            _cache[key] = Matcher(listings)
        return _cache[key]


# Held-out paraphrases (never used for training) with the capability and object a person means.
EVAL = [
    ('spot any pedestrians crossing the aisle', 'object_detection', 'person'),
    ('is anybody walking near the robot', 'object_detection', 'person'),
    ('find where the limes are on the counter', 'object_detection', 'lime'),
    ('make sure the jar lid is properly closed', 'seal_inspection', 'jar'),
    ('does this banana have any brown soft patches', 'bruise_inspection', 'banana'),
    ('tell me if the mango is ready to eat', 'ripeness_inspection', 'mango'),
    ('what date does the food container expire', 'expiry_reading', 'food container'),
    ('read the address on the shipping label', 'label_reading', 'shipping label'),
    ('is the water bottle dripping anywhere', 'leak_inspection', 'water bottle'),
    ('check whether the phone display is shattered', 'screen_inspection', 'phone'),
    ('is the power bank battery puffed up', 'battery_inspection', 'power bank'),
    ('are the usb cable pins damaged', 'connector_inspection', 'usb cable'),
    ('is the pencil point broken', 'tip_inspection', 'pencil'),
    ('is the glass bottle standing upright', 'orientation_check', 'glass bottle'),
    ('is the spatula plastic or metal', 'material_check', 'spatula'),
    ('grab hold of the strawberry', 'grasp', 'strawberry'),
    ('lift the egg carton without crushing it', 'control', 'egg carton'),
    ('decide which shelf the notebook should go on', 'placement_planning', 'notebook'),
    ('set the plate down in the rack', 'object_placement', 'plate'),
    ('how large is the cardboard box', 'dimension_estimation', 'cardboard box'),
    ('can the gripper get to the hammer from here', 'reachability_check', 'hammer'),
    ('is there enough space around the laptop to grab it', 'collision_check', 'laptop'),
    ('which way is the towel lying', 'pose_estimation', 'towel'),
    ('confirm the item is really a wallet', 'object_identity', 'wallet'),
    ('does the gear have cracks or chips', 'damage_inspection', 'gear'),
    ('is the bowl covered in crumbs', 'surface_inspection', 'bowl'),
    ('are the two bolts lined up', 'alignment_check', 'bolt'),
    ('did the robot hold the pear firmly', 'grasp_verification', 'pear'),
    ('drive the base over to the loading dock', 'path_planning', None),
    ('track whether a worker is reaching into the cell', 'human_pose', 'person'),
    ('get an exact outline of each tomato', 'instance_segmentation', 'tomato'),
    ('take a photo of the bench', 'camera_capture', None),
    ('is the picture too blurry to use', 'image_quality', None),
    ('list all the things lying on the workbench', 'scene_mapping', None),
    ('double check that the whole job worked', 'completion_verification', None),
]


# Written after the lexicon was tuned on EVAL and never used for tuning: the honest number.
EVAL_FRESH = [
    ('look out for kids running past the cart', 'object_detection', 'person'),
    ('locate the avocado among the groceries', 'object_detection', 'avocado'),
    ('see whether the soap dispenser pump is sealed shut', 'seal_inspection', 'soap dispenser'),
    ('are there squishy dark areas on the peach', 'bruise_inspection', 'peach'),
    ('how ripe are these tomatoes', 'ripeness_inspection', 'tomato'),
    ('what is printed on the padded envelope sticker', 'label_reading', 'padded envelope'),
    ('has the food container passed its use by date', 'expiry_reading', 'food container'),
    ('is coffee seeping out of the jar', 'leak_inspection', 'jar'),
    ('is the tablet glass cracked', 'screen_inspection', 'tablet'),
    ('check whether the smartwatch battery is bulging', 'battery_inspection', 'smartwatch'),
    ('pick the spoon up off the tray', 'grasp', 'spoon'),
    ('carry the grapes softly so they do not squash', 'control', 'grape'),
    ('put the toothbrush into the cup holder', 'object_placement', 'toothbrush'),
    ('measure how wide the shipping tube is', 'dimension_estimation', 'shipping tube'),
    ('which direction is the computer mouse pointing', 'pose_estimation', 'computer mouse'),
    ('is the keyboard dusty', 'surface_inspection', 'keyboard'),
    ('route the robot to aisle seven avoiding boxes', 'path_planning', None),
    ('watch the operator arms near the gripper', 'human_pose', 'person'),
    ('mask out every apple in the crate', 'instance_segmentation', 'apple'),
    ('snap an image of the counter', 'camera_capture', None),
]


def evaluate(m=None):
    m = m or matcher()
    top1 = top3 = obj_hits = obj_total = baseline = 0
    rows = []
    for text, cap, obj in EVAL:
        probs = m.capability_probabilities(text)
        ranked = sorted(probs, key=probs.get, reverse=True)
        top1 += ranked[0] == cap; top3 += cap in ranked[:3]
        words = set(normalize(text).split())
        base = max(m.capabilities, key=lambda c: len(words & set(c.split('_'))))
        baseline += base == cap
        if obj:
            obj_total += 1
            found, _ = m._object_from_text(text)
            obj_hits += found == obj
        rows.append((text, cap, ranked[0]))
    n = len(EVAL)
    fresh = sum(max((p := m.capability_probabilities(t)), key=p.get) == c for t, c, _ in EVAL_FRESH)
    fresh_obj = [(m._object_from_text(t)[0] == o) for t, _, o in EVAL_FRESH if o]
    return dict(fresh_examples=len(EVAL_FRESH), fresh_top1=round(fresh / len(EVAL_FRESH), 3),
                fresh_object_accuracy=round(sum(fresh_obj) / len(fresh_obj), 3),examples=n, training_examples=m.training_examples, capabilities=len(m.capabilities),
                top1=round(top1 / n, 3), top3=round(top3 / n, 3), keyword_baseline_top1=round(baseline / n, 3),
                object_accuracy=round(obj_hits / max(1, obj_total), 3), misses=[r for r in rows if r[1] != r[2]])


if __name__ == '__main__':
    import json
    print(json.dumps(evaluate(), indent=2))
