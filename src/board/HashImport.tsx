import { useEffect } from "react";
import { useBoard } from "./store";
import { hashToBoard } from "./io";

/** On mount, if the URL carries a shared board (#board=…), offer to load it,
 *  then strip the hash so later reloads use the local board. Renders nothing. */
export function HashImport() {
  const { dispatch } = useBoard();
  useEffect(() => {
    const m = /[#&]board=([^&]+)/.exec(location.hash);
    if (!m) return;
    const board = hashToBoard(m[1]);
    const clear = () => history.replaceState(null, "", location.pathname + location.search);
    if (board && confirm("Open the shared board? This replaces your current board.")) {
      dispatch({ type: "import", board });
    }
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
