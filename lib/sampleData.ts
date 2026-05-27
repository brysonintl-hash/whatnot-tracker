export type SaleOrder = {
  tab: string;
  orderId: string;
  orderNum: string;
  buyer: string;
  modelNum: string;
  productName: string;
  qty: number;
  sold: number;
  cost: number;
  earn: number;
  profit: number;
  margin: number;
  showDuration: string;
  host: string;
};

export type InventoryItem = {
  rowIndex: number;
  imageUrl: string;
  upc: string;
  modelNum: string;
  asin: string;
  description: string;
  jz: number;
  old: number;
  newStock: number;
  amz: number;
  ws: number;
  wn: number;
  fbm: number;
  qty: number;
  retail: number;
  total: number;
};

export const sampleSales: SaleOrder[] = [
  { tab: '5/26/26', orderId: 'rG58VG9BpL', orderNum: '1064183999', buyer: 'andrewzer', modelNum: 'DCE530B', productName: 'DEWALT DCE530B 20V MAX Cordless Compact Heat Gun', qty: 1, sold: 81, cost: 62.65, earn: 71.35, profit: 8.70, margin: 12.19, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: 'uqGacsAHy4', orderNum: '1064185373', buyer: 'manesh12345', modelNum: '2200402', productName: 'Greenworks 2200402 40V Brushless Hedge Trimmer', qty: 1, sold: 49, cost: 48.99, earn: 42.97, profit: -6.02, margin: -14.01, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: 'TZACxJqxYZ', orderNum: '1064172031', buyer: 'sparky68000', modelNum: 'DW2567', productName: 'DEWALT DW2567 #6 9/64-in. High Speed Steel Counter', qty: 1, sold: 5, cost: 4.53, earn: 4.47, profit: -0.53, margin: -13.25, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: 'FBvhd5WS8Z', orderNum: '1064188273', buyer: 'andrewzer', modelNum: 'DCS16200', productName: 'DEWALT DCS16200 2 in. x 16-Gauge Bright Finish Straight', qty: 1, sold: 20, cost: 14.62, earn: 17.31, profit: 2.69, margin: 15.54, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: 'WWedYXcYGu', orderNum: '1064198570', buyer: 'emilykay65', modelNum: '48-22-1026M', productName: 'Milwaukee 48-22-1026M 8 m/26 ft. Compact Magnetic', qty: 1, sold: 13, cost: 8.73, earn: 11.10, profit: 2.37, margin: 21.35, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: 'VVQHCS6iVK', orderNum: '1064192817', buyer: 'davidada94479', modelNum: '48-73-2105', productName: 'Milwaukee 48-73-2105 Anti-Scratch Safety Glasses Gray', qty: 1, sold: 4, cost: 3.13, earn: 3.14, profit: 0.01, margin: 0.32, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: '5ywGUXHJWN', orderNum: '1064204885', buyer: 'davidada94479', modelNum: '48-22-3100', productName: 'Milwaukee 48-22-3100 INKZALL Black Fine Point Jobsite Perma', qty: 1, sold: 7, cost: 0.34, earn: 5.92, profit: 5.58, margin: 94.26, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: '9EJbC9oUFS', orderNum: '1064206729', buyer: 'emilykay65', modelNum: '33-428THL', productName: 'Stanley 33-428THL PowerLock 8m/26 ft. x 1 in. Tape Me', qty: 1, sold: 8, cost: 6.64, earn: 6.68, profit: 0.04, margin: 0.60, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: 'ybunEKCGVh', orderNum: '1064207372', buyer: 'emilykay65', modelNum: 'DWHT36916S', productName: 'DEWALT DWHT36916S Tough Tape 16 ft. x 1-1/4 in. Tap', qty: 1, sold: 14, cost: 10.14, earn: 12.15, profit: 2.01, margin: 16.54, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/26/26', orderId: 'wvEAgMA9Vw', orderNum: '1064208806', buyer: 'randystoolshop', modelNum: '48-22-3103', productName: 'Milwaukee 48-22-3103 Inkzall Medium Chisel Tip Black J', qty: 1, sold: 2, cost: 0.96, earn: 1.48, profit: 0.52, margin: 35.14, showDuration: '00h 51m', host: 'Jason' },
  { tab: '5/2/26', orderId: 'aBC123xyz', orderNum: '1063000001', buyer: 'toolshopper', modelNum: 'DCF887B', productName: 'DEWALT 20V MAX XR Impact Driver', qty: 1, sold: 95, cost: 71.25, earn: 83.50, profit: 12.25, margin: 14.67, showDuration: '01h 15m', host: 'Jason' },
  { tab: '5/2/26', orderId: 'dEF456abc', orderNum: '1063000002', buyer: 'milwaukeefan', modelNum: '2760-20', productName: 'Milwaukee M18 FUEL Die Grinder', qty: 1, sold: 125, cost: 98.50, earn: 110.00, profit: 11.50, margin: 10.45, showDuration: '01h 15m', host: 'Jason' },
  { tab: '5/2/26', orderId: 'gHI789def', orderNum: '1063000003', buyer: 'builderpro', modelNum: 'DWE575SB', productName: 'DEWALT 7-1/4 in. Lightweight Circular Saw', qty: 1, sold: 89, cost: 67.80, earn: 78.50, profit: 10.70, margin: 13.63, showDuration: '01h 15m', host: 'Sarah' },
  { tab: '5/2/26', orderId: 'jKL012ghi', orderNum: '1063000004', buyer: 'diyguru', modelNum: '48-22-8485', productName: 'Milwaukee PACKOUT Wall and Floor Mount', qty: 2, sold: 44, cost: 22.38, earn: 38.76, profit: 16.38, margin: 42.26, showDuration: '01h 15m', host: 'Sarah' },
  { tab: '4/12/26', orderId: 'mNO345jkl', orderNum: '1061000001', buyer: 'handyman_pro', modelNum: 'DCS391B', productName: 'DEWALT 20V MAX 6-1/2 in. Circular Saw', qty: 1, sold: 75, cost: 56.25, earn: 66.00, profit: 9.75, margin: 14.77, showDuration: '02h 30m', host: 'Jason' },
  { tab: '4/12/26', orderId: 'pQR678mno', orderNum: '1061000002', buyer: 'toolcollector', modelNum: '2767-20', productName: 'Milwaukee M18 FUEL High Torque Impact Wrench', qty: 1, sold: 185, cost: 142.00, earn: 163.00, profit: 21.00, margin: 12.88, showDuration: '02h 30m', host: 'Jason' },
  { tab: '4/12/26', orderId: 'sTU901pqr', orderNum: '1061000003', buyer: 'fixitfrank', modelNum: 'DW735X', productName: 'DEWALT 13 in. Two-Speed Thickness Planer', qty: 1, sold: 350, cost: 280.00, earn: 308.00, profit: 28.00, margin: 9.09, showDuration: '02h 30m', host: 'Mike' },
  { tab: '4/12/26', orderId: 'vWX234stu', orderNum: '1061000004', buyer: 'probuilder', modelNum: '48-59-1850', productName: 'Milwaukee M18 5.0 Ah Battery 2-Pack', qty: 1, sold: 129, cost: 98.00, earn: 113.52, profit: 15.52, margin: 13.67, showDuration: '02h 30m', host: 'Mike' },
  { tab: '4/5/26', orderId: 'yZA567vwx', orderNum: '1060000001', buyer: 'workshopking', modelNum: 'DCS361B', productName: 'DEWALT 20V MAX Cordless Miter Saw', qty: 1, sold: 225, cost: 180.00, earn: 198.00, profit: 18.00, margin: 9.09, showDuration: '01h 45m', host: 'Sarah' },
  { tab: '4/5/26', orderId: 'bCD890yza', orderNum: '1060000002', buyer: 'contractorjoe', modelNum: '2852-20', productName: 'Milwaukee M18 1/2 in. Drill/Driver', qty: 1, sold: 69, cost: 52.25, earn: 60.72, profit: 8.47, margin: 13.94, showDuration: '01h 45m', host: 'Sarah' },
];

export const sampleInventory: InventoryItem[] = [
  { rowIndex: 2, imageUrl: '', upc: '650480000001', modelNum: 'DCE530B', asin: 'B08X9YZ123', description: 'DEWALT DCE530B 20V MAX Cordless Compact Heat Gun', jz: 0, old: 10, newStock: 0, amz: 0, ws: 0, wn: 21, fbm: 0, qty: 5, retail: 43.97, total: 219.85 },
  { rowIndex: 3, imageUrl: '', upc: '008925138372', modelNum: 'DS0903CPP', asin: 'B07XYZ1234', description: 'Diablo Carbide Tipped Pruning and Clean Wood Blades, 2-Pc Set, 9in', jz: 1, old: 0, newStock: 0, amz: 0, ws: 0, wn: 1, fbm: 0, qty: 12, retail: 9.47, total: 113.64 },
  { rowIndex: 4, imageUrl: '', upc: '650480000002', modelNum: 'Skycrawler', asin: 'B09ABC5678', description: 'Skycrawler RC Truck', jz: 0, old: 0, newStock: 0, amz: 0, ws: 0, wn: 2, fbm: 0, qty: 0, retail: 149.99, total: 0 },
  { rowIndex: 5, imageUrl: '', upc: '088381478182', modelNum: 'BL1830B', asin: 'B01LZQ2PDI', description: 'Makita 18V LXT Lithium-Ion High Capacity Battery Pack 3.0Ah', jz: 0, old: 1, newStock: 0, amz: 0, ws: 1, wn: 0, fbm: 0, qty: 8, retail: 124.00, total: 992.00 },
  { rowIndex: 6, imageUrl: '', upc: '045242145157', modelNum: '48-52-5020', asin: 'B000CSWDUA', description: 'Milwaukee 4 in. Stainless-Steel Twist Knot Cable Wheel', jz: 0, old: 36, newStock: 0, amz: 0, ws: 26, wn: 9, fbm: 0, qty: 45, retail: 28.47, total: 1281.15 },
  { rowIndex: 7, imageUrl: '', upc: '045242249350', modelNum: '48-32-4984', asin: 'B009NXGI60', description: 'Milwaukee SHOCKWAVE Impact Duty 2 in. T20 Torx Alloy Steel Screw Driver Bit (2-Pack)', jz: 0, old: 60, newStock: 420, amz: 0, ws: 217, wn: 13, fbm: 0, qty: 250, retail: 7.47, total: 1867.50 },
  { rowIndex: 8, imageUrl: '', upc: '045242308231', modelNum: '48-22-8485', asin: 'B09XYZ9876', description: 'Milwaukee PACKOUT Wall and Floor Mount', jz: 0, old: 0, newStock: 0, amz: 0, ws: 0, wn: 5, fbm: 0, qty: 3, retail: 31.97, total: 95.91 },
  { rowIndex: 9, imageUrl: '', upc: '028877234567', modelNum: 'DCS16200', asin: 'B08ABC1234', description: 'DEWALT DCS16200 2 in. x 16-Gauge Bright Finish Straight Nails', jz: 0, old: 0, newStock: 0, amz: 0, ws: 0, wn: 8, fbm: 0, qty: 2, retail: 20.00, total: 40.00 },
  { rowIndex: 10, imageUrl: '', upc: '045242000001', modelNum: '2767-20', asin: 'B07XYZ5555', description: 'Milwaukee M18 FUEL High Torque Impact Wrench 1/2 in.', jz: 2, old: 5, newStock: 0, amz: 1, ws: 3, wn: 4, fbm: 0, qty: 18, retail: 185.00, total: 3330.00 },
  { rowIndex: 11, imageUrl: '', upc: '028877000002', modelNum: 'DCF887B', asin: 'B07ABC6666', description: 'DEWALT 20V MAX XR Brushless Cordless Compact Impact Driver', jz: 1, old: 8, newStock: 2, amz: 0, ws: 4, wn: 6, fbm: 0, qty: 22, retail: 95.00, total: 2090.00 },
  { rowIndex: 12, imageUrl: '', upc: '045242000003', modelNum: '48-59-1850', asin: 'B08DEF7777', description: 'Milwaukee M18 REDLITHIUM 5.0 Ah Battery 2-Pack', jz: 0, old: 12, newStock: 0, amz: 2, ws: 8, wn: 5, fbm: 0, qty: 0, retail: 129.00, total: 0 },
];
