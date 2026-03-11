"use client";
// All task rendering happens client-side — no server round-trip needed
// since task data is static (TASKS array), making navigation instant.
import { TASKS } from "@/lib/tasks";
import { TaskPage } from "./task-page";
import { Header } from "@/components/layout/header";

export function TaskShell({ taskId }: { taskId: string }) {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return null;

  return (
    <div className="flex flex-col h-full">
      <Header title={task.label} subtitle={task.description} />
      <div className="flex-1 p-6 overflow-auto">
        <TaskPage task={task} />
      </div>
    </div>
  );
}
