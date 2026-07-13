export function getLocalDateStr(offset) {
  var d = new Date();
  d.setDate(d.getDate() + offset);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export function getLocalDateFromUtc(utcDateStr) {
  if (!utcDateStr) return null;
  var d = new Date(utcDateStr);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export function formatDateShort(dateStr) {
  var parts = dateStr.split("-");
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function isToday(dateStr) {
  return dateStr === getLocalDateStr(0);
}

export function isYesterday(dateStr) {
  return dateStr === getLocalDateStr(-1);
}

export function isTomorrow(dateStr) {
  return dateStr === getLocalDateStr(1);
}

export function relativeDateLabel(dateStr) {
  if (isToday(dateStr)) return "Today";
  if (isYesterday(dateStr)) return "Yesterday";
  if (isTomorrow(dateStr)) return "Tomorrow";
  return formatDateShort(dateStr);
}
