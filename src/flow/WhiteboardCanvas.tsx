import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  useNodesState,
  type Node,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useBoard } from "../board/store";
import { WhiteboardCardNode, type WhiteboardCardData } from "./WhiteboardCardNode";
import type { Card, WhiteboardBoard } from "../board/types";
import { compressImage, MAX_IMAGE_SOURCE_BYTES } from "../board/imageUtils";

const nodeTypes: NodeTypes = { card: WhiteboardCardNode };

export function WhiteboardCanvas() {
  // WhiteboardCanvas is only ever mounted for whiteboard boards (App.tsx branches by board.kind).
  const { board: rawBoard, dispatch, viewOnly } = useBoard();
  const board = rawBoard as WhiteboardBoard;
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  const onRequestImage = useCallback((cardId: string) => {
    uploadTargetId.current = cardId;
    fileRef.current?.click();
  }, []);

  const cardToNode = useCallback(
    (card: Card): Node => ({
      id: card.id,
      type: "card",
      position: { x: card.x, y: card.y },
      style: { width: card.width, height: card.height },
      data: {
        cardId: card.id,
        text: card.text,
        color: card.color,
        image: card.image,
        onRequestImage,
      } satisfies WhiteboardCardData,
    }),
    [onRequestImage]
  );

  // No hierarchy, no layout to compute -- nodes always mirror board.cards
  // directly; position/size are just whatever's stored on the card.
  useEffect(() => {
    setNodes(Object.values(board.cards).map(cardToNode));
  }, [board, setNodes, cardToNode]);

  const onNodeDragStop = useCallback<OnNodeDrag>(
    (_e, node) => {
      dispatch({ type: "moveCard", id: node.id, x: node.position.x, y: node.position.y });
    },
    [dispatch]
  );

  const runFit = useCallback(() => {
    setTimeout(() => fitView({ duration: 500, padding: 0.15, maxZoom: 1.2, minZoom: 0.05 }), 30);
  }, [fitView]);

  const addCard = useCallback(() => {
    const wrap = wrapRef.current;
    const rect = wrap?.getBoundingClientRect();
    const point = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const center = screenToFlowPosition(point);
    dispatch({ type: "addCard", x: center.x - 120, y: center.y - 80 });
  }, [dispatch, screenToFlowPosition]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const cardId = uploadTargetId.current;
    uploadTargetId.current = null;
    if (!file || !cardId) return;
    if (file.size > MAX_IMAGE_SOURCE_BYTES) {
      alert("That image is too large (max 8MB).");
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      dispatch({ type: "patchCard", id: cardId, patch: { image: dataUrl } });
    } catch {
      alert("Could not read that image.");
    }
  };

  return (
    <div className="canvas-wrap wb-canvas-wrap" ref={wrapRef}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        nodesDraggable={!viewOnly}
        fitView
        minZoom={0.05}
        maxZoom={2}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-right" className="canvas-panel">
          {!viewOnly && (
            <button className="tbtn" onClick={addCard}>
              + Add card
            </button>
          )}
          <button className="tbtn" onClick={runFit}>
            Fit
          </button>
        </Panel>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="var(--dots)" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.data as WhiteboardCardData).color ?? "var(--edge)"}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFileChange} />
    </div>
  );
}
