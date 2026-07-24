import { Helmet } from "react-helmet-async";

export default function StructuredData({ data }) {
  if (!data) return null;

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(data)}
      </script>
    </Helmet>
  );
}