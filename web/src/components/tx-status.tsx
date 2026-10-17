import { explorerTx } from "@/lib/config";
import type { TxStatus } from "@/lib/hooks";

/** One line under an action button: what is happening, what happened, or what went wrong. */
export function TxStatusLine({ status }: { status: TxStatus }) {
  if (status.kind === "idle") return null;
  if (status.kind === "working")
    return (
      <p role="status" className="mt-3 text-[0.95rem] text-silt">
        {status.step}…
      </p>
    );
  if (status.kind === "failed")
    return (
      <p role="alert" className="mt-3 text-[0.95rem] text-flare">
        {status.message}
      </p>
    );
  return (
    <p role="status" className="mt-3 text-[0.95rem] text-plankton">
      {status.message}
      {status.signature && (
        <>
          {" "}
          <a href={explorerTx(status.signature)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            View transaction
          </a>
        </>
      )}
    </p>
  );
}
