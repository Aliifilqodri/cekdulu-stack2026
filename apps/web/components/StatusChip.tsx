import { STATUS_LABEL, type Status } from "@/lib/contoh";

const GAYA: Record<Status, string> = {
  open: "bg-open-soft text-open-text",
  queue: "bg-queue-soft text-queue-text",
  closed: "bg-closed-soft text-closed-text",
  unknown: "bg-unknown-soft text-unknown-text",
};

export default function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-2 pr-2.5 text-[11.5px] font-bold ${GAYA[status]}`}
    >
      <i className="h-[7px] w-[7px] rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}
