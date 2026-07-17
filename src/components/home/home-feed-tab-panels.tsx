"use client";

import React, { useEffect, useState, type ReactNode } from "react";

export function HomeFeedTabPanels({ activeTab, recommendation, renderWardrobe }: {
  activeTab: "recommendation" | "wardrobe";
  recommendation: ReactNode;
  renderWardrobe: () => ReactNode;
}) {
  const [wardrobeMounted, setWardrobeMounted] = useState(activeTab === "wardrobe");

  useEffect(() => {
    if (activeTab === "wardrobe") setWardrobeMounted(true);
  }, [activeTab]);

  return (
    <>
      <div id="home-recommendation-panel" role="tabpanel" aria-labelledby="home-recommendation-tab" hidden={activeTab !== "recommendation"}>
        {recommendation}
      </div>
      <div id="home-wardrobe-panel" role="tabpanel" aria-labelledby="home-wardrobe-tab" hidden={activeTab !== "wardrobe"}>
        {wardrobeMounted ? renderWardrobe() : null}
      </div>
    </>
  );
}
