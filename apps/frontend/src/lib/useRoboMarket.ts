import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Arm,
  Offer,
  Plan,
  RecentMission,
  Receipt,
  WalletState,
} from "./types";

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/api" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error?.message ||
        "Unable to reach RoboMarket. Check the local services and try again.",
    );
  return data as T;
}
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional. */
  }
}
const initialArm: Arm = {
  phase: "idle",
  progress: 0,
  running: false,
  object_name: "orange",
  grasp_point_px: [390, 220],
  output: null,
  reason: "Awaiting purchased shard outputs",
};

export function useRoboMarket() {
  const [models, setModels] = useState<Offer[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [arm, setArm] = useState(initialArm);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [recent, setRecent] = useState<RecentMission[]>(() =>
    stored("robomarket-recent", []),
  );
  const [task, setTask] = useState("");
  const [budget, setBudget] = useState("0.05");
  const [deadline, setDeadline] = useState(3000);
  const [gripper, setGripper] = useState("parallel_jaw");
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState("Simulator RGB view");
  const activePlan = useRef(plan);
  activePlan.current = plan;
  const mutation = useRef(false);
  const remember = useCallback((next: Plan) => {
    activePlan.current = next;
    setPlan(next);
    try {
      localStorage.setItem("robomarket-plan", next.id);
    } catch {
      /* Optional. */
    }
    setRecent((previous) => {
      const updated = [
        { id: next.id, title: next.request.task },
        ...previous.filter((item) => item.id !== next.id),
      ].slice(0, 8);
      persist("robomarket-recent", updated);
      return updated;
    });
  }, []);
  const restoreFields = useCallback((next: Plan) => {
    setTask(next.request.task);
    setBudget(next.request.budget_ausd);
    setDeadline(next.request.inference_deadline_ms);
    setGripper(next.request.robot_card?.gripper || "parallel_jaw");
    setImage(next.request.image_base64);
    setImageName(
      next.request.image_base64
        ? "Saved task observation"
        : "Simulator RGB view",
    );
  }, []);
  const refresh = useCallback(async () => {
    await Promise.allSettled([
      api<Offer[]>("/marketplace/models")
        .then((result) => {
          setModels(result);
          setOnline(true);
        })
        .catch(() => setOnline(false)),
      Promise.all([
        api<WalletState>("/wallet/robot_001"),
        api<Receipt[]>("/transactions"),
      ])
        .then(([nextWallet, nextReceipts]) => {
          setWallet(nextWallet);
          setReceipts(nextReceipts);
          setPaymentError("");
        })
        .catch((reason: Error) => setPaymentError(reason.message)),
    ]);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void refresh();
    void api<Arm>("/arm")
      .then(setArm)
      .catch(() => {});
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("robomarket-plan");
    } catch {
      /* Optional. */
    }
    if (saved)
      void api<Plan>("/agent/plans/" + encodeURIComponent(saved))
        .then((next) => {
          if (!cancelled) {
            remember(next);
            restoreFields(next);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setRestoring(false);
        });
    else setRestoring(false);
    const interval = setInterval(() => void refresh(), 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refresh, remember, restoreFields]);

  // The existing simulator is advanced by its operator's dashboard, including across navigation.
  useEffect(() => {
    let pending = false;
    const interval = setInterval(async () => {
      if (pending || mutation.current) return;
      const current = activePlan.current;
      if (
        !current ||
        !["running", "waiting_for_motion"].includes(current.status)
      )
        return;
      pending = true;
      try {
        if (current.status === "running") {
          remember(await api<Plan>("/agent/plans/" + current.id));
        } else {
          const state = await api<Arm>("/arm/control", { action: "tick" });
          setArm(state);
          if (state.phase === "complete") {
            mutation.current = true;
            setBusy(true);
            try {
              remember(
                await api<Plan>("/agent/execute", { plan_id: current.id }),
              );
              await refresh();
            } finally {
              mutation.current = false;
              setBusy(false);
            }
          }
        }
      } catch (reason) {
        setError((reason as Error).message);
      } finally {
        pending = false;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [remember, refresh]);

  async function change<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  const createPlan = () =>
    change(async () => {
      if (!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(budget) || Number(budget) <= 0) {
        throw new Error("Enter a positive mission budget with up to six decimal places.");
      }
      const next = await api<Plan>("/agent/plan", {
        task: task.trim(),
        budget_ausd: budget,
        inference_deadline_ms: deadline,
        robot_card: {
          robot_id: "robot_001",
          embodiment: "6dof_arm",
          dof: 6,
          gripper,
          max_payload_kg: 1.5,
          sensors: ["rgb", "depth", "wrist_force"],
          onboard_compute: "jetson_orin",
        },
        ...(image ? { image_base64: image } : {}),
      });
      remember(next);
      return next;
    });
  const execute = () =>
    change(async () => {
      if (!plan) return;
      remember(await api<Plan>("/agent/execute", { plan_id: plan.id }));
      setArm(await api<Arm>("/arm"));
      await refresh();
    });
  const cancel = () =>
    change(async () => {
      if (!plan) return;
      remember(await api<Plan>("/agent/cancel", { plan_id: plan.id }));
      setArm(await api<Arm>("/arm"));
    });
  const newMission = () =>
    change(async () => {
      if (plan && !["completed", "cancelled"].includes(plan.status))
        remember(await api<Plan>("/agent/cancel", { plan_id: plan.id }));
      setArm(await api<Arm>("/arm/control", { action: "reset" }));
      activePlan.current = null;
      setPlan(null);
      setTask("");
      try {
        localStorage.removeItem("robomarket-plan");
      } catch {
        /* Optional. */
      }
      return true;
    });
  const openMission = (id: string) =>
    change(async () => {
      const current = activePlan.current;
      if (
        current &&
        current.id !== id &&
        ["running", "waiting_for_motion"].includes(current.status)
      )
        throw new Error(
          "Finish or cancel the active mission before opening another.",
        );
      const next = await api<Plan>("/agent/plans/" + encodeURIComponent(id));
      remember(next);
      restoreFields(next);
      return next;
    });
  const control = (action: "start" | "pause") =>
    change(async () => setArm(await api<Arm>("/arm/control", { action })));
  async function upload(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 5_000_000) {
      setError("Choose an image under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      setError("This image could not be read. Try another file.");
    reader.onload = () => {
      setImage((reader.result as string).split(",")[1]);
      setImageName(file.name);
      setError("");
    };
    reader.readAsDataURL(file);
  }
  return {
    models,
    plan,
    arm,
    wallet,
    receipts,
    online,
    paymentError,
    error,
    setError,
    busy,
    restoring,
    recent,
    task,
    setTask,
    budget,
    setBudget,
    deadline,
    setDeadline,
    gripper,
    setGripper,
    image,
    imageName,
    upload,
    clearImage: () => {
      setImage(undefined);
      setImageName("Simulator RGB view");
    },
    refresh,
    createPlan,
    execute,
    cancel,
    newMission,
    openMission,
    control,
  };
}
export type RoboMarket = ReturnType<typeof useRoboMarket>;
