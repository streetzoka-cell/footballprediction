import { useEffect, useState } from "react";

export default function AppLoader() {
  const messages = [
    "Loading today's fixtures...",
    "Fetching live scores...",
    "Preparing predictions...",
    "Updating league tables...",
    "Checking today's matches...",
    "Finding trending fixtures...",
    "Loading basketball games...",
    "Connecting to live servers...",
    "Almost kick-off...",
    "Welcome to ZOKASCORE",
  ];

  const [message, setMessage] = useState(messages[0]);
  const [progress, setProgress] = useState(10);
  const [rotate, setRotate] = useState(0);

  useEffect(() => {
    document.title = "⚽ Loading... | ZOKASCORE";

    const messageTimer = setInterval(() => {
      setMessage((current) => {
        const index = messages.indexOf(current);
        return messages[(index + 1) % messages.length];
      });
    }, 2000);


    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        return prev + Math.floor(Math.random() * 7) + 2;
      });
    }, 500);


    const ballTimer = setInterval(() => {
      setRotate((prev) => prev + 40);
    }, 1500);


    return () => {
      clearInterval(messageTimer);
      clearInterval(progressTimer);
      clearInterval(ballTimer);
    };

  }, []);


  return (
    <div style={styles.container}>

      {/* Stadium lights */}
      <div style={styles.lightTop}></div>
      <div style={styles.lightLeft}></div>
      <div style={styles.lightRight}></div>


      {/* Floating footballs */}
      <div style={styles.floatBallLeft}>
        ⚽
      </div>

      <div style={styles.floatBallRight}>
        ⚽
      </div>


      <div style={styles.content}>

        <div style={styles.liveBadge}>
          <span style={styles.dot}></span>
          LIVE
        </div>


        <div
          style={{
            ...styles.ball,
            transform:
              `translateY(-10px) rotate(${rotate}deg)`
          }}
        >
          ⚽
        </div>


        <h1 style={styles.logo}>
          ZOKASCORE
        </h1>


        <p style={styles.loadingText}>
          {message}
        </p>


        <div style={styles.progressOuter}>
          <div
            style={{
              ...styles.progressInner,
              width: `${progress}%`,
            }}
          />
        </div>


        <p style={styles.tagline}>
          LIVE SCORES • PREDICTIONS • LEADERBOARD
        </p>

      </div>


    </div>
  );
}


const styles = {

  container: {
    position: "fixed",
    inset: 0,
    background:
      "#06131d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 9999,
    color: "#fff",
  },


  content: {
    width: "90%",
    maxWidth: "430px",
    textAlign: "center",
    zIndex: 2,
  },


  liveBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 18px",
    borderRadius: "30px",
    background:
      "rgba(0,255,120,.12)",
    border:
      "1px solid rgba(0,255,120,.4)",
    color: "#00ff88",
    fontWeight: "800",
    fontSize: "13px",
    letterSpacing: "2px",
    animation:
      "pulse 1.5s infinite",
  },


  dot: {
    width: "9px",
    height: "9px",
    background:"#00ff88",
    borderRadius:"50%",
    boxShadow:
      "0 0 15px #00ff88",
  },


  ball: {
    fontSize:"90px",
    marginTop:"35px",
    display:"inline-block",
    transition:
      "transform 1.2s ease",
    filter:
      "drop-shadow(0 0 25px rgba(0,255,120,.5))",
  },


  logo:{
    marginTop:"10px",
    fontSize:"40px",
    fontWeight:"900",
    letterSpacing:"5px",
    color:"#00ff88",
    textShadow:
      "0 0 20px rgba(0,255,120,.6)",
  },


  loadingText:{
    marginTop:"20px",
    fontSize:"17px",
    color:"#d8ffe8",
    minHeight:"25px",
  },


  progressOuter:{
    width:"100%",
    height:"10px",
    marginTop:"35px",
    background:
      "rgba(255,255,255,.12)",
    borderRadius:"20px",
    overflow:"hidden",
  },


  progressInner:{
    height:"100%",
    background:
      "#00ff88",
    borderRadius:"20px",
    transition:
      "width .5s ease",
    boxShadow:
      "0 0 15px #00ff88",
  },


  tagline:{
    marginTop:"30px",
    fontSize:"12px",
    letterSpacing:"2px",
    color:
      "rgba(255,255,255,.65)",
  },


  lightTop:{
    position:"absolute",
    top:"-80px",
    left:"40%",
    width:"200px",
    height:"200px",
    borderRadius:"50%",
    background:
      "rgba(0,255,120,.15)",
    filter:"blur(60px)",
    animation:
      "pulse 3s infinite",
  },


  lightLeft:{
    position:"absolute",
    left:"-100px",
    top:"30%",
    width:"250px",
    height:"250px",
    borderRadius:"50%",
    background:
      "rgba(0,255,120,.08)",
    filter:"blur(80px)",
  },


  lightRight:{
    position:"absolute",
    right:"-100px",
    bottom:"20%",
    width:"250px",
    height:"250px",
    borderRadius:"50%",
    background:
      "rgba(0,255,120,.08)",
    filter:"blur(80px)",
  },


  floatBallLeft:{
    position:"absolute",
    top:"20%",
    left:"10%",
    fontSize:"45px",
    opacity:.15,
    animation:
      "float 5s infinite",
  },


  floatBallRight:{
    position:"absolute",
    bottom:"20%",
    right:"10%",
    fontSize:"60px",
    opacity:.12,
    animation:
      "float 7s infinite reverse",
  }

};