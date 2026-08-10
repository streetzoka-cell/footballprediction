export default async function handler(req, res) {
  try {
    var response = await fetch("https://zokascore.xyz/index.html");
    var html = await response.text();
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(html);
  } catch (e) {
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send("<html><head><title>ZOKASCORE</title></head><body></body></html>");
  }
}