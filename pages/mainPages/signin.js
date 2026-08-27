import Layout from "@/components/core/client/frames/layout";
import SigninContent from "@/components/core/client/contents/signinContent";

export default function Signin() {
  return (
    <>
      <SigninContent />
    </>
  );
}

Signin.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
