// Auto-extracted from Office_Layout xlsx - Current sheet
// Grid positions are [col, row] in spreadsheet coordinates

const OFFICE_LAYOUT = {
  // Regular desks: { id, col, row, label }
  desks: [
    // Top cluster - Row 1-4 (cols K-AB)
    { id: 1,  col: 11, row: 1,  label: "1" },
    { id: 2,  col: 12, row: 1,  label: "2" },
    { id: 3,  col: 11, row: 3,  label: "3" },
    { id: 4,  col: 12, row: 3,  label: "4" },
    { id: 5,  col: 14, row: 1,  label: "5" },
    { id: 6,  col: 15, row: 1,  label: "6" },
    { id: 7,  col: 14, row: 3,  label: "7" },
    { id: 8,  col: 17, row: 1,  label: "8" },
    { id: 9,  col: 18, row: 1,  label: "9" },
    { id: 10, col: 17, row: 3,  label: "10" },
    { id: 11, col: 18, row: 3,  label: "11" },
    { id: 12, col: 21, row: 1,  label: "12" },
    { id: 13, col: 22, row: 1,  label: "13" },
    { id: 14, col: 21, row: 3,  label: "14" },
    { id: 15, col: 24, row: 1,  label: "15" },
    { id: 16, col: 25, row: 1,  label: "16" },
    { id: 17, col: 24, row: 3,  label: "17" },
    { id: 18, col: 25, row: 3,  label: "18" },
    { id: 19, col: 27, row: 1,  label: "19" },
    { id: 20, col: 28, row: 1,  label: "20" },
    { id: 21, col: 27, row: 3,  label: "21" },
    { id: 22, col: 28, row: 3,  label: "22" },
    // Side desks rows 10-11
    { id: 24, col: 9,  row: 10, label: "24" },
    { id: 25, col: 9,  row: 11, label: "25" },
    // Bottom row
    { id: 26, col: 2,  row: 16, label: "26" },
  ],

  standingDesks: [
    { id: "S1", col: 4,  row: 16, label: "S1" },
    { id: "S2", col: 6,  row: 16, label: "S2" },
    { id: "S3", col: 8,  row: 16, label: "S3" },
  ],

  rooms: [
    { label: "Juno Boardroom",    col: 4,  row: 5,  w: 6, h: 3, type: "boardroom" },
    { label: "Vimy Boardroom",    col: 43, row: 6,  w: 4, h: 3, type: "boardroom" },
    { label: "Kapyong",           col: 31, row: 1,  w: 4, h: 3, type: "meeting" },
    { label: "Passchendaele",     col: 35, row: 1,  w: 5, h: 3, type: "meeting" },
    { label: "Kandahar",          col: 43, row: 7,  w: 4, h: 2, type: "meeting" },
    { label: "Sam's Office",      col: 43, row: 12, w: 4, h: 2, type: "office" },
    { label: "Kitchen",           col: 14, row: 16, w: 4, h: 2, type: "amenity" },
    { label: "Nook",              col: 20, row: 14, w: 2, h: 2, type: "amenity" },
    { label: "Closet",            col: 23, row: 14, w: 2, h: 2, type: "amenity" },
    { label: "Storage",           col: 25, row: 14, w: 2, h: 2, type: "amenity" },
    { label: "Controlled\nGood Room", col: 33, row: 14, w: 4, h: 3, type: "restricted" },
    { label: "IT Room",           col: 37, row: 14, w: 3, h: 3, type: "restricted" },
    { label: "Electrical Room",   col: 34, row: 15, w: 4, h: 2, type: "restricted" },
  ]
};

export default OFFICE_LAYOUT;
