"""One autonomous robot loop, owned by the API process rather than a browser tab."""
import asyncio
import contextlib
from services.agent.executor import execute, get, save
from services.storage import db, event
from shared.schemas.contracts import MissionPlan
from apps.simulation.arm import arm
from apps.simulation.world import world

ACTIVE = ('queued', 'preparing', 'running', 'waiting_for_motion')

class Runtime:
    def __init__(self):
        self.task = None
        self.clock = None
        self.guard = asyncio.Lock()

    async def start(self):
        # Simulator state is in memory. Never resume an interrupted physical action or payment.
        with db() as conn:
            interrupted = [MissionPlan.model_validate_json(row['body']) for row in conn.execute('SELECT body FROM plans')]
        for plan in interrupted:
            if plan.status in ACTIVE:
                plan.status = 'blocked'
                plan.explanation += ' Server restarted: motion state was lost. Existing purchases must be reconciled before a new execution.'
                for step in plan.subtasks:
                    if step.status in ('running', 'waiting_for_motion'):
                        step.status = 'blocked'
                        step.error = 'Interrupted by server restart; inspect the payment ledger before buying again.'
                save(plan)
        self.clock = asyncio.create_task(self._clock())

    async def close(self):
        if self.clock:
            self.clock.cancel()
            with contextlib.suppress(asyncio.CancelledError): await self.clock
        # Let an in-flight authorization settle and persist its outcome on shutdown.
        if self.task and not self.task.done():
            try: await asyncio.wait_for(asyncio.shield(self.task), timeout=5)
            except asyncio.TimeoutError:
                self.task.cancel()
                with contextlib.suppress(asyncio.CancelledError): await self.task
        arm.running = False
        world.stop('Server stopped')

    async def _clock(self):
        while True:
            arm.tick()
            world.tick()
            await asyncio.sleep(.5)

    async def submit(self, plan_id):
        async with self.guard:
            plan = get(plan_id)
            if self.task and not self.task.done():
                if plan.status in ACTIVE: return plan
                raise RuntimeError('Scout is already executing another mission')
            if plan.status in ('completed', 'cancelled', 'blocked'): return plan
            plan.status = 'queued'
            save(plan)
            self.task = asyncio.create_task(self._run(plan_id))
            return plan

    async def _run(self, plan_id):
        try:
            plan = await asyncio.to_thread(execute, plan_id)
            while plan.status == 'waiting_for_motion':
                is_arm = bool(plan.request.robot_card and plan.request.robot_card.embodiment == '6dof_arm')
                step = next(s for s in plan.subtasks if s.status == 'waiting_for_motion')
                while True:
                    await asyncio.sleep(.25)
                    current = get(plan_id)
                    if current.status in ('cancelled', 'blocked'): return
                    ready = arm.phase == 'complete' if is_arm else world.position == (step.target.x, step.target.y)
                    if ready: break
                plan = await asyncio.to_thread(execute, plan_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            plan = get(plan_id)
            plan.status = 'blocked'
            plan.explanation += f' Execution stopped: {type(exc).__name__}. Review setup and the payment ledger.'
            save(plan)
            arm.running = False
            world.stop('Mission execution stopped')
        finally:
            event({'type': 'mission_state', 'plan_id': plan_id, 'status': get(plan_id).status})

runtime = Runtime()
