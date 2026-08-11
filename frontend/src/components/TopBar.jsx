import NotificationBell from "./NotificationBell.jsx";

export default function TopBar() {
  return (
    <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-2 border-b border-slate-200 bg-white">
      <NotificationBell />
    </div>
  );
}
