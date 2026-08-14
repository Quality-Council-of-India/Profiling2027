import { useQueryClient } from "@tanstack/react-query";
import { Card, RefreshButton } from "../components/ui.jsx";
import HallOfRecognition from "../components/HallOfRecognition.jsx";
import { TrophyIcon } from "../components/icons.jsx";

export default function HallOfRecognitionPage() {
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <TrophyIcon className="text-accent" width="22" height="22" />
            Hall of Recognition
          </h1>
          <p className="text-sm text-slate-500">
            Top Total Peer Score by role each closed week, irrespective of field, plus a cumulative
            Overall Star Performer from the 2nd closed week onward.
          </p>
        </div>
        <RefreshButton
          onClick={() => queryClient.invalidateQueries({ queryKey: ["hallOfRecognition"] })}
          label="Refresh Hall of Recognition"
        />
      </div>

      <Card className="p-5">
        <HallOfRecognition />
      </Card>
    </div>
  );
}
