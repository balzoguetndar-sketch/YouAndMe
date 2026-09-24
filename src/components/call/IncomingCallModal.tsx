'use client';

type IncomingCallModalProps = {
  callerEmail: string;
  callType: 'audio' | 'video';
  ambience: string;
  onAccept: () => void;
  onReject: () => void;
};

export function IncomingCallModal({
  callerEmail,
  callType,
  ambience,
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="w-20 h-20 mx-auto rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-3xl animate-bounce">
          {callType === 'video' ? '📹' : '🎙️'}
        </div>

        <div>
          <h3 className="text-xl font-bold text-slate-100">Appel entrant</h3>
          <p className="mt-1 text-sm text-slate-400">
            <strong className="text-indigo-400">{callerEmail}</strong> souhaite démarrer une session <span className="capitalize font-semibold">{ambience}</span>.
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onReject}
            className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold text-white transition-all shadow-lg"
          >
            Refuser
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white transition-all shadow-lg"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}