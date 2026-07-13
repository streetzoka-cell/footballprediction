import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";


export default defineConfig({

  plugins:[

    react(),

    VitePWA({

      registerType:"autoUpdate",

      includeAssets:[
        "favicon.ico",
        "icons/icon-192.png",
        "icons/icon-512.png"
      ],


      manifest:{
        name:"ZOKASCORE Football Predictions",
        short_name:"ZOKASCORE",
        description:
        "Live football scores, fixtures, predictions and sports updates.",

        theme_color:"#07141f",

        background_color:"#07141f",

        display:"standalone",

        start_url:"/",

        icons:[
          {
            src:"/icons/icon-192.png",
            sizes:"192x192",
            type:"image/png"
          },

          {
            src:"/icons/icon-512.png",
            sizes:"512x512",
            type:"image/png"
          }
        ]

      }

    })

  ]

});