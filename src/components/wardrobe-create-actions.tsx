// src/components/wardrobe-create-actions.tsx
// v1.1.9 4C: 从 wardrobe-app.tsx 迁移全局新建按钮类型与工具函数。

import React from "react";
import { Camera, Layers, ShoppingBag } from "lucide-react";

export type CreateActionType = "add_single_item" | "create_outfit" | "add_wishlist_item";

export interface CreateActionItem {
  type: CreateActionType;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export function createActionsForView(view: string): CreateActionItem[] {
  const items: CreateActionItem[] = [
    { type: "add_single_item", title: "添加衣物", description: "拍照并添加到衣橱。", icon: React.createElement(Camera, { size: 18 }) },
    { type: "create_outfit", title: "添加套装", description: "从已有衣橱单品中创建一套穿搭。", icon: React.createElement(Layers, { size: 18 }) },
  ];
  items.push({ type: "add_wishlist_item", title: "添加种草单品", description: "记录感兴趣但还没有购买的商品。", icon: React.createElement(ShoppingBag, { size: 18 }) });
  return view === "wardrobe" || view === "recommend" || view === "shopping" ? items : [];
}

export type ViewKey = "wardrobe" | "capture" | "recommend" | "shopping" | "settings";

export const preferredCreateActionByView: Partial<Record<ViewKey, CreateActionType>> = {
  wardrobe: "add_single_item",
  recommend: "create_outfit",
  shopping: "add_wishlist_item",
};
