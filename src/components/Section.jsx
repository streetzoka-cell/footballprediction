import PropTypes from "prop-types";

export default function Section({
  title,
  children,
}) {
  return (
    <section>
      <h2
        style={{
          fontSize: "1.6rem",
          marginBottom: 16,
          color: "#ffffff",
        }}
      >
        {title}
      </h2>

      <div
        style={{
          color: "#c8d3df",
          lineHeight: 1.9,
          fontSize: "1rem",
        }}
      >
        {children}
      </div>
    </section>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
};