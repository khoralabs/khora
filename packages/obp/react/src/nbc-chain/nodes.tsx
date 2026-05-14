import { Handle, type NodeProps, type NodeTypes, Position } from "@xyflow/react";
import { type ComponentPropsWithoutRef, memo } from "react";
import type { NbcChainOfferNodeData, NbcChainPortNodeData } from "./layout.ts";
import { mergeClassNames } from "./merge-class-names.ts";

export type NbcChainOfferNodeProps = NodeProps & ComponentPropsWithoutRef<"div">;

export const NbcChainOfferNode = memo(function NbcChainOfferNodeFn(props: NbcChainOfferNodeProps) {
  const {
    id: _id,
    data,
    type: _type,
    width: _width,
    height: _height,
    sourcePosition: _sourcePosition,
    targetPosition: _targetPosition,
    dragHandle: _dragHandle,
    parentId: _parentId,
    dragging: _dragging,
    zIndex: _zIndex,
    selectable: _selectable,
    deletable: _deletable,
    draggable: _draggable,
    isConnectable: _isConnectable,
    positionAbsoluteX: _positionAbsoluteX,
    positionAbsoluteY: _positionAbsoluteY,
    selected,
    className,
    ...divProps
  } = props;
  const offerData = data as NbcChainOfferNodeData;
  return (
    <div
      data-slot="nbc-chain-offer-node"
      data-selected={selected ? "" : undefined}
      className={mergeClassNames(className)}
      {...divProps}
    >
      <Handle type="target" position={Position.Left} />
      <div data-slot="nbc-chain-offer-party-label">{offerData.partyLabel}</div>
      <div data-slot="nbc-chain-offer-title">{offerData.title}</div>
      <div data-slot="nbc-chain-offer-subtitle">{offerData.subtitle}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export type NbcChainPortNodeProps = NodeProps & ComponentPropsWithoutRef<"div">;

export const NbcChainPortNode = memo(function NbcChainPortNodeFn(props: NbcChainPortNodeProps) {
  const {
    id: _id,
    data,
    type: _type,
    width: _width,
    height: _height,
    sourcePosition: _sourcePosition,
    targetPosition: _targetPosition,
    dragHandle: _dragHandle,
    parentId: _parentId,
    dragging: _dragging,
    zIndex: _zIndex,
    selectable: _selectable,
    deletable: _deletable,
    draggable: _draggable,
    isConnectable: _isConnectable,
    positionAbsoluteX: _positionAbsoluteX,
    positionAbsoluteY: _positionAbsoluteY,
    selected,
    className,
    ...divProps
  } = props;
  const portData = data as NbcChainPortNodeData;
  return (
    <div
      data-slot="nbc-chain-port-node"
      data-selected={selected ? "" : undefined}
      className={mergeClassNames(className)}
      {...divProps}
    >
      <Handle type="target" position={Position.Left} />
      <div data-slot="nbc-chain-port-party-label">{portData.partyLabel}</div>
      <div data-slot="nbc-chain-port-title">{portData.title}</div>
      <div data-slot="nbc-chain-port-subtitle">{portData.subtitle}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const nbcChainDefaultNodeTypes = {
  offer: NbcChainOfferNode,
  port: NbcChainPortNode,
} satisfies NodeTypes;
