import SEO from "../../components/SEO";

export default function About() {
  return (
    <>
      <SEO
        title="About ZOKASCORE"
        description="Learn about ZOKASCORE, its mission, vision, technology, and founder Kimutai Gibson."
        path="/about"
        keywords={[
          "About ZOKASCORE",
          "Football platform",
          "Sports platform Kenya",
          "Kimutai Gibson",
        ]}
      />

      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "40px 20px",
          color: "#fff",
        }}
      >
        <h1
          style={{
            fontSize: "2.8rem",
            marginBottom: 10,
          }}
        >
          About ZOKASCORE
        </h1>

        <p
          style={{
            color: "#b7c4d4",
            fontSize: "1.1rem",
            lineHeight: 1.8,
          }}
        >
          ZOKASCORE is a modern sports platform built to provide football fans
          with reliable live scores, fixtures, match predictions, standings,
          basketball coverage, statistics, and real-time sports updates in one
          fast and user-friendly experience.
        </p>

        <section style={{ marginTop: 50 }}>
          <h2>Our Mission</h2>

          <p style={{ lineHeight: 1.8 }}>
            Our mission is to make sports information accessible, accurate, and
            fast for everyone. We aim to deliver an enjoyable experience for
            football enthusiasts by combining real-time data with a clean,
            modern interface.
          </p>
        </section>

        <section style={{ marginTop: 40 }}>
          <h2>Our Vision</h2>

          <p style={{ lineHeight: 1.8 }}>
            We envision ZOKASCORE becoming one of Africa's leading sports
            platforms, connecting millions of fans with live scores,
            predictions, statistics, league tables, and community-driven
            football content.
          </p>
        </section>

        <section style={{ marginTop: 40 }}>
          <h2>What We Offer</h2>

          <ul
            style={{
              lineHeight: 2,
              paddingLeft: 20,
            }}
          >
            <li>Live football scores</li>
            <li>Today's football fixtures</li>
            <li>Football predictions</li>
            <li>League standings</li>
            <li>Basketball fixtures and scores</li>
            <li>Match highlights</li>
            <li>Leaderboards</li>
            <li>User accounts and personalized experiences</li>
          </ul>
        </section>

        <section style={{ marginTop: 40 }}>
          <h2>Technology</h2>

          <p style={{ lineHeight: 1.8 }}>
            ZOKASCORE is built using modern web technologies including React,
            Vite, Firebase, Node.js, and optimized APIs to deliver fast,
            responsive, and reliable sports information across desktop and
            mobile devices.
          </p>
        </section>

        <section style={{ marginTop: 40 }}>
          <h2>Founder</h2>

          <p style={{ lineHeight: 1.8 }}>
            <strong>Kimutai Gibson</strong> is the Founder and Lead Developer of
            ZOKASCORE. He designed and built the platform with the goal of
            creating a modern sports experience that is fast, informative, and
            accessible to football fans around the world.
          </p>
        </section>

        <section style={{ marginTop: 40 }}>
          <h2>Our Commitment</h2>

          <p style={{ lineHeight: 1.8 }}>
            We continuously improve ZOKASCORE by enhancing performance,
            expanding sports coverage, and introducing new features that help
            fans stay connected with the games they love.
          </p>
        </section>
      </div>
    </>
  );
}