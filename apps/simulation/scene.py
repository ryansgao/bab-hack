"""Explicit scene ground truth for the local demo, never real camera inference."""
import base64
import io
from copy import deepcopy
from PIL import Image, ImageDraw

OBJECTS = [
    dict(id='mug', name='coffee mug', aliases=['mug','cup','coffee cup'], category='drinkware', bbox=[330,140,420,245], size_mm=[85,85,100], mass_kg=.28, fragility=.6, surface_dirt=.18, defects=[], contents='empty', handle=True, destination='inspection_pad', color='#c5d8c7'),
    dict(id='wrench', name='wrench', aliases=['spanner'], category='tool', bbox=[120,130,240,165], size_mm=[150,35,12], mass_kg=.2, fragility=.1, surface_dirt=.05, defects=[], contents=None, handle=False, destination='tool_rack', color='#8f9baf'),
    dict(id='screwdriver', name='screwdriver', aliases=[], category='tool', bbox=[130,225,255,250], size_mm=[160,25,25], mass_kg=.12, fragility=.1, surface_dirt=.02, defects=['worn handle'], contents=None, handle=True, destination='tool_rack', color='#dd9e71'),
    dict(id='package_a', name='package a', aliases=['parcel a'], category='package', bbox=[450,110,540,180], size_mm=[100,80,60], mass_kg=.35, fragility=.3, surface_dirt=0, defects=[], contents='sealed; unknown', handle=False, destination='shipping_a', color='#ceb18a'),
    dict(id='package_b', name='package b', aliases=['parcel b'], category='package', bbox=[460,250,550,320], size_mm=[100,80,60], mass_kg=.3, fragility=.3, surface_dirt=.1, defects=['dented corner'], contents='sealed; unknown', handle=False, destination='shipping_b', color='#d9bf9d'),
]

def default_scene():
    return deepcopy({'id':'workbench_v1','source':'simulation_fixture','width':640,'height':400,
        'objects':OBJECTS,'zones':{'tool_rack':[170,340], 'inspection_pad':[350,320], 'shipping_a':[530,70], 'shipping_b':[530,350]}})

def find_objects(scene, name):
    if not name: return scene['objects']
    query=name.lower().strip()
    groups={'tools':'tool','tool':'tool','packages':'package','package':'package','parcels':'package'}
    return [o for o in scene['objects'] if query in [o['name'],o['id'],*o['aliases']] or o['category']==groups.get(query)]

def render_scene(scene):
    image=Image.new('RGB',(scene['width'],scene['height']),'#e5e7df')
    draw=ImageDraw.Draw(image)
    draw.rounded_rectangle((40,45,600,380),radius=20,fill='#f4eee3',outline='#b7bbae',width=2)
    draw.text((20,15),'SIMULATED RGB CAMERA / WORKBENCH 01',fill='#435447')
    for name,(x,y) in scene['zones'].items():
        draw.rectangle((x-35,y-15,x+35,y+15),outline='#b1b6a5')
        draw.text((x-33,y-10),name.replace('_',' '),fill='#7a8170')
    for item in scene['objects']:
        x1,y1,x2,y2=item['bbox']
        draw.rounded_rectangle(tuple(item['bbox']),radius=8,fill=item['color'],outline='#626e61',width=2)
        if item['id']=='mug':
            draw.ellipse((x1+8,y1+5,x2-8,y1+28),fill='#e4ddd0',outline='#626e61',width=2)
            draw.arc((x2-5,y1+28,x2+25,y2-12),270,90,fill='#626e61',width=5)
            if item['surface_dirt']: draw.ellipse((x1+25,y1+42,x1+45,y1+57),fill='#9d8267')
        draw.text((x1,y2+5),item['name'],fill='#435447')
        if item['defects']: draw.line((x1+4,y1+4,x1+20,y1+12),fill='#985c47',width=3)
    return image

def scene_image(scene):
    out=io.BytesIO(); render_scene(scene).save(out,format='PNG')
    return base64.b64encode(out.getvalue()).decode()
