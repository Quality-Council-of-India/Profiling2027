import NotificationBell from "./NotificationBell.jsx";
import { HelpIcon } from "./icons.jsx";

export default function TopBar({ onOpenTour }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-end gap-1 px-6 py-2 border-b border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <button
        onClick={onOpenTour}
        data-tour="help"
        title="Take the guided tour"
        aria-label="Help"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-standard"
      >
        <HelpIcon />
      </button>
      <NotificationBell />
    </div>
  );
}
