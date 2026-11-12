import { DEVICE_STATUS } from './deviceMeta';

const STATUS_PILLS = Object.fromEntries(
  Object.entries(DEVICE_STATUS).map(([key, meta]) => [key, { label: meta.label, cls: meta.cls }])
);

export default function StatusPill({ status }) {
  const pill = STATUS_PILLS[status] || STATUS_PILLS.AVAILABLE;
  return <span className={`status-pill ${pill.cls}`}>{pill.label}</span>;
}

export { STATUS_PILLS };