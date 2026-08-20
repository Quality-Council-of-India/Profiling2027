import { useQueryClient } from "@tanstack/react-query";
import { RefreshButton } from "../components/ui.jsx";
import BroadcastEmail from "../components/BroadcastEmail.jsx";

export default function AdminBroadcastPage() {
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900">Send an Email</h1>
        <RefreshButton
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
            queryClient.invalidateQueries({ queryKey: ["emailBroadcasts"] });
          }}
          label="Refresh"
        />
      </div>
      <BroadcastEmail />
    </div>
  );
}
