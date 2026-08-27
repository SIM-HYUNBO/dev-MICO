import { useState } from "react";
import Layout from "@/components/core/client/frames/layout";
import EDocDesignerContainer from "@/components/core/client/eDoc/eDocDesignerContainer";

export default function EDocDesigner() {
  return (
    <Layout mobileFullScreen>
      <EDocDesignerContainer />
    </Layout>
  );
}
