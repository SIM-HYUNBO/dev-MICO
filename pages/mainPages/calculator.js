// pages/calculator.js
import Layout from "@/components/core/client/frames/layout";
import CalculatorContent from "@/components/core/client/contents/calculatorContent";

export default function Calculator() {
  return <CalculatorContent />;
}

Calculator.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
