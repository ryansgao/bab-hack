"""Benchmark marketplace detectors on COCO128 and publish provenance.

    python -m services.models.benchmark                      # every detector whose deps are installed
    python -m services.models.benchmark --models yolo11n ssdlite

COCO128 is the first 128 images of COCO train2017 with ground-truth boxes,
published by Ultralytics as a GitHub release asset. Each detector runs through
`inference.detect()`, the same code path a paid request uses.

Results are written to services/models/benchmarks.json. The registry reads that
file and lists `quality` = mAP@0.5 with `quality_source: measured_benchmark`.
Latency is warm per-image wall time on the benchmarking machine (2 torch threads).
"""
import argparse
import datetime
import json
import platform
import statistics
import sys
import time
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from services.models import inference  # noqa: E402

DATASET_URL = 'https://github.com/ultralytics/assets/releases/download/v0.0.0/coco128.zip'
RESULTS = Path(__file__).with_name('benchmarks.json')
IOU = .5
COLLECT_THRESHOLD = .05  # low threshold for the precision/recall curve behind AP


def coco_names():
    from services.marketplace.registry import COCO_OBJECTS
    return COCO_OBJECTS


def dataset(folder):
    root = folder / 'coco128'
    if not root.exists():
        folder.mkdir(parents=True, exist_ok=True)
        archive = folder / 'coco128.zip'
        if not archive.exists(): urllib.request.urlretrieve(DATASET_URL, archive)
        with zipfile.ZipFile(archive) as z: z.extractall(folder)
    names, samples = coco_names(), []
    for image_path in sorted((root / 'images/train2017').glob('*.jpg')):
        label_path = root / 'labels/train2017' / f'{image_path.stem}.txt'
        with Image.open(image_path) as image: width, height = image.size
        boxes = []
        if label_path.exists():
            for line in label_path.read_text().split('\n'):
                if not line.strip(): continue
                cls, cx, cy, w, h = line.split()
                cx, cy, w, h = float(cx) * width, float(cy) * height, float(w) * width, float(h) * height
                boxes.append((names[int(cls)], [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]))
        samples.append((image_path, boxes))
    return samples


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0


def match(predictions, truths):
    """Greedy COCO-style matching per class; returns [(label, confidence, is_true_positive)]."""
    used, rows = set(), []
    for p in sorted(predictions, key=lambda p: -p.confidence):
        best, best_iou = None, IOU
        for i, (label, box) in enumerate(truths):
            if i in used or label != p.label: continue
            overlap = iou(p.bbox, box)
            if overlap >= best_iou: best, best_iou = i, overlap
        if best is not None: used.add(best)
        rows.append((p.label, p.confidence, best is not None))
    return rows


def average_precision(rows, positives):
    """All-point interpolated AP from (confidence, tp) rows."""
    if not positives: return None
    rows = sorted(rows, key=lambda r: -r[0])
    tp = fp = 0
    curve = []
    for _, hit in rows:
        tp, fp = tp + hit, fp + (not hit)
        curve.append((tp / positives, tp / (tp + fp)))
    ap, previous_recall = 0.0, 0.0
    for i, (recall, _) in enumerate(curve):
        ap += (recall - previous_recall) * max(p for _, p in curve[i:])
        previous_recall = recall
    return ap


def evaluate(model_id, samples):
    inference.prepare(model_id)
    with Image.open(samples[0][0]) as warm: inference.detect(model_id, warm.convert('RGB'))  # exclude first-call setup
    per_class, positives, latencies = defaultdict(list), defaultdict(int), []
    served_tp = served_fp = 0
    for path, truths in samples:
        with Image.open(path) as image:
            image = image.convert('RGB')
            started = time.perf_counter()
            predictions = inference.detect(model_id, image, threshold=COLLECT_THRESHOLD)
            latencies.append((time.perf_counter() - started) * 1000)
        for label, _ in truths: positives[label] += 1
        for label, confidence, hit in match(predictions, truths):
            per_class[label].append((confidence, hit))
            if confidence >= inference.SERVING_THRESHOLD:
                served_tp, served_fp = served_tp + hit, served_fp + (not hit)
    ap = {label: average_precision(per_class[label], count) for label, count in positives.items()}
    total = sum(positives.values())
    latencies.sort()
    return {
        'model_id': model_id,
        'map50': round(statistics.mean(ap.values()), 4),
        'precision_at_serving_threshold': round(served_tp / max(1, served_tp + served_fp), 4),
        'recall_at_serving_threshold': round(served_tp / max(1, total), 4),
        'serving_threshold': inference.SERVING_THRESHOLD,
        'latency_ms_p50': round(statistics.median(latencies), 1),
        'latency_ms_p95': round(latencies[int(.95 * (len(latencies) - 1))], 1),
        'images': len(samples),
        'ground_truth_boxes': total,
        'classes_evaluated': len(ap),
        'ap50_selected_classes': {k: round(v, 4) for k, v in sorted(ap.items()) if k in ('person', 'orange', 'apple', 'banana', 'cup', 'bottle', 'bowl')},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--models', nargs='*', default=None)
    parser.add_argument('--data', default='data/benchmarks')
    args = parser.parse_args()
    wanted = args.models or [m for m in inference.CLOSED_SET_DETECTORS if inference.dependencies_installed(m)]
    samples = dataset(Path(args.data))
    existing = json.loads(RESULTS.read_text()) if RESULTS.exists() else {'results': {}}
    for model_id in wanted:
        if model_id not in inference.CLOSED_SET_DETECTORS:
            print(f'skip {model_id}: only closed-set COCO detectors are benchmarked on COCO128'); continue
        try:
            result = evaluate(model_id, samples)
        except Exception as exc:  # leave earlier results in place; report why this one is missing
            print(f'skip {model_id}: {type(exc).__name__}: {exc}'); continue
        import torch
        result.update(measured_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
                      hardware=f'{platform.machine()} {platform.processor() or platform.system()}, {torch.get_num_threads()} torch threads, CPU')
        existing['results'][model_id] = result
        print(json.dumps(result))
    existing.update(dataset='COCO128 (first 128 images of COCO train2017, Ultralytics release v0.0.0)',
                    dataset_url=DATASET_URL, metric=f'mAP@{IOU} (all-point interpolation, mean over classes present)',
                    note='COCO128 images come from COCO train2017; pretrained COCO weights may have seen them, so absolute mAP is optimistic. Use it to compare shards, not as a field accuracy claim.')
    RESULTS.write_text(json.dumps(existing, indent=2) + '\n')


if __name__ == '__main__':
    main()
