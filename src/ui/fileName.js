// The name Export suggests for the downloaded file.
//
// Named for the program rather than the subject: "retirement-plan" reads
// like a document any of a dozen tools could have written, while
// "retiresim" says which one wrote it and which one reads it back. Nothing
// depends on the name on the way in -- importFields() checks the version
// inside the file -- so files saved under the old name still import.
//
// Local time, not UTC: the name exists so it matches when the person
// remembers making the file, and one several hours off from that is worse
// than no timestamp at all. Every getter below reads local time already,
// which is also what makes this testable without pinning a timezone -- a
// Date built from local parts round-trips through them unchanged.
//
// The ISO-like ordering (year, month, day, then time) is deliberate: it
// makes a directory of exports sort by name into sorted-by-age, which the
// browser's own "(1)", "(2)" disambiguation does not reliably do.
const PAD = 2;

function pad(value) {
    return String(value).padStart(PAD, '0');
}

export function exportFileName(now) {
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `retiresim-${date}T${time}.json`;
}
