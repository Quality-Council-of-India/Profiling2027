import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "../api/endpoints.js";
import { Modal, Spinner, ErrorBanner } from "./ui.jsx";
import { ROLE_LABELS } from "../utils/constants.js";

/** Triggered by clicking the Sidebar's user-info footer. Shows profile
 * details and peer mapping — deliberately never a password, since bcrypt
 * hashes can't be viewed by anyone, including Admin. */
export default function AboutProfileModal({ user, onClose }) {
  const navigate = useNavigate();
  const isAdmin = user.role === "admin";
  const peersQuery = useQuery({ queryKey: ["myPeers"], queryFn: usersApi.myPeers, enabled: !isAdmin });

  function handleRaiseConcern() {
    onClose();
    navigate("/concerns");
  }

  return (
    <Modal title="About Profile" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">{user.name}</p>
          <p className="text-xs text-slate-500">
            {ROLE_LABELS[user.role]}
            {user.field ? ` · ${user.field}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400 uppercase tracking-wide mb-0.5">Email</p>
            <p className="text-slate-700 break-all">{user.email}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase tracking-wide mb-0.5">Password</p>
            <p className="text-slate-400 italic">Hidden — one-way hashed, not viewable by anyone</p>
          </div>
        </div>

        {!isAdmin && (
          <>
            {peersQuery.isLoading ? (
              <Spinner />
            ) : peersQuery.isError ? (
              <ErrorBanner message="Failed to load peer mapping" />
            ) : (
              <div className="space-y-3">
                <PeerList title="Peers You Evaluate" peers={peersQuery.data.peersIEvaluate} />
                <PeerList title="Peers Who Evaluate You" peers={peersQuery.data.peersWhoEvaluateMe} />
              </div>
            )}

            <button
              onClick={handleRaiseConcern}
              className="w-full px-3 py-2 rounded-lg text-white text-sm font-medium bg-nav hover:bg-nav-deep transition-standard"
            >
              Raise a Concern
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function PeerList({ title, peers }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-600 mb-1.5">
        {title} ({peers.length})
      </p>
      {peers.length === 0 ? (
        <p className="text-xs text-slate-400">None mapped.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {peers.map((p) => (
            <span key={p.id} className="px-2 py-1 rounded-md bg-slate-100 text-xs text-slate-700">
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
