import { Helmet } from "react-helmet-async";

export default function StructuredData({ data }) {
  if (!data) return null;

  return (
    <Helmet>
      {/* 
        ★ FIX: Use dangerouslySetInnerHTML to prevent Vite JSX parser from crashing.
        Putting raw JSON directly inside <script> tags in JSX causes a ParseError in Vite.
      */}
      <script 
        type="application/ld+json" 
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} 
      />
    </Helmet>
  );
}