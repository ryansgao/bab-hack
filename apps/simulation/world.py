"""Grid robot. Local collision checking never depends on a paid service."""
import base64
import heapq
import io
import math
from threading import RLock
from PIL import Image, ImageDraw
from shared.schemas.contracts import Observation, Point, Vector

def astar(start, goal, blocked, width=24, height=16):
    start, goal = tuple(start), tuple(goal)
    blocked = set(map(tuple, blocked))
    if goal in blocked or not (0 <= goal[0] < width and 0 <= goal[1] < height): return []
    queue = [(0, start)]
    costs, parent = {start: 0}, {}
    while queue:
        _, current = heapq.heappop(queue)
        if current == goal:
            path = [current]
            while current in parent:
                current = parent[current]
                path.append(current)
            return list(reversed(path))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nxt = current[0] + dx, current[1] + dy
            if not (0 <= nxt[0] < width and 0 <= nxt[1] < height) or nxt in blocked: continue
            cost = costs[current] + 1
            if cost < costs.get(nxt, math.inf):
                costs[nxt], parent[nxt] = cost, current
                heapq.heappush(queue, (cost + abs(nxt[0]-goal[0]) + abs(nxt[1]-goal[1]), nxt))
    return []

class World:
    def __init__(self):
        self.lock = RLock()
        self.reset()

    def reset(self):
        with self.lock:
            self.position, self.target = (2, 2), (21, 13)
            self.shelves = {(x, y) for x0 in (5, 11, 17) for x in range(x0, x0+2) for y in range(4, 12)}
            self.obstacles, self.pedestrians = set(), []
            self.path, self.running, self.authorized = [], False, False
            self.revision = getattr(self, 'revision', -1) + 1
            self.velocity, self.tick_count = (0, 0), 0
            self.speed_divisor, self.reason = 1, 'Ready for a mission'

    def blocked(self):
        return self.shelves | self.obstacles | set(self.pedestrians)

    def observe(self):
        with self.lock:
            distances = [math.dist(self.position, p) for p in self.blocked()]
            return Observation(position=Point(x=self.position[0], y=self.position[1]),
                velocity=Vector(x=self.velocity[0], y=self.velocity[1]),
                nearest_obstacle_distance=min(distances, default=24),
                nearby_agent_count=sum(math.dist(self.position, p) <= 5 for p in self.pedestrians),
                sensor_uncertainty=.45, revision=self.revision)

    def snapshot(self):
        with self.lock:
            return dict(width=24, height=16, position=self.position, target=self.target,
                shelves=sorted(self.shelves), obstacles=sorted(self.obstacles), pedestrians=self.pedestrians,
                path=self.path, running=self.running, authorized=self.authorized, reason=self.reason,
                observation=self.observe().model_dump())

    def stop(self, reason):
        with self.lock:
            self.running, self.velocity, self.reason = False, (0, 0), reason

    def apply(self, result, target):
        with self.lock:
            if result.observation_revision != self.revision:
                self.stop('Observation changed while inference ran; create a fresh plan')
                raise ValueError('Stale observation; paid result retained but not applied')
            if result.source == 'pretrained_model':
                # A detector may make us MORE cautious; no detections never proves the path safe.
                self.speed_divisor = 3 if any(p.label == 'person' for p in result.predictions) else 2
                self.reason = 'Perception applied: cautious speed; local sensors enforce stopping'
            if result.path:
                path = [(p.x, p.y) for p in result.path]
                if path[0] != self.position or path[-1] != (target.x, target.y): raise ValueError('Invalid route endpoints')
                if any(p in self.blocked() for p in path) or any(math.dist(a,b) != 1 for a,b in zip(path,path[1:])):
                    raise ValueError('Provider route failed local validation')
                self.path, self.target, self.authorized = path, (target.x, target.y), True
                self.reason = 'Purchased route validated by local controller'

    def tick(self):
        with self.lock:
            if not self.running: return self.snapshot()
            self.tick_count += 1
            for i, (x, y) in enumerate(self.pedestrians):
                direction = 1 if (self.tick_count // 10) % 2 == 0 else -1
                nxt = (x + direction, y)
                if 0 <= nxt[0] < 24 and nxt not in self.shelves | self.obstacles and nxt != self.position:
                    self.pedestrians[i] = nxt
            if self.tick_count % self.speed_divisor: return self.snapshot()
            if self.observe().nearest_obstacle_distance <= 1 and any(math.dist(self.position,p) <= 1 for p in self.pedestrians):
                self.velocity, self.reason = (0, 0), 'Local safety stop: pedestrian nearby'
                return self.snapshot()
            if not self.authorized:
                self.stop('Waiting for a purchased and validated route')
                return self.snapshot()
            self.path = astar(self.position, self.target, self.blocked())
            if len(self.path) > 1:
                nxt = self.path[1]
                self.velocity = (nxt[0]-self.position[0], nxt[1]-self.position[1])
                self.position = nxt
                self.path = self.path[1:]
                self.revision += 1
                self.reason = 'Navigating with local A* collision avoidance'
            else:
                self.stop('Destination reached' if self.position == self.target else 'No safe route; stopped')
            return self.snapshot()

    def control(self, command):
        with self.lock:
            if command.action == 'reset': self.reset()
            elif command.action == 'start': self.running = True
            elif command.action == 'pause': self.stop('Paused by operator')
            elif command.action == 'tick': return self.tick()
            elif command.action in ('add_obstacle', 'add_pedestrian'):
                p = (command.point.x, command.point.y) if command.point else (9, 2)
                if p == self.position or p in self.blocked(): raise ValueError('Choose an empty cell')
                if command.action == 'add_obstacle': self.obstacles.add(p)
                else: self.pedestrians.append(p)
                self.revision += 1
                if self.authorized: self.path = astar(self.position, self.target, self.blocked())
            return self.snapshot()

    def sensor_image(self):
        with self.lock:
            image = Image.new('RGB', (768, 512), '#e5e7eb')
            draw = ImageDraw.Draw(image)
            for x, y in self.shelves | self.obstacles:
                draw.rectangle((x*32,y*32,x*32+30,y*32+30), fill='#334155')
            for x, y in self.pedestrians:
                draw.ellipse((x*32+8,y*32,x*32+24,y*32+16), fill='#dc2626')
                draw.rectangle((x*32+7,y*32+16,x*32+25,y*32+31), fill='#dc2626')
            out = io.BytesIO()
            image.save(out, format='PNG')
            return base64.b64encode(out.getvalue()).decode()

world = World()
