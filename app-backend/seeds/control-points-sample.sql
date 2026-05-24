-- Sample Control Points Data
-- Zimbabwe National Control Point Database

INSERT INTO control_points (
  monu_num, monu_name, type, comp_sheet, topo, gauss_lo, y_gauss, x_gauss,
  msl_hgt, ped_hgt, pill_hgt, top_signal, bot_signal, last_insp, deg_sqr, remark, area_nm
) VALUES
  ('1/P', 'Gasikani', 'PRIM', 'TS0404', '1730A1', 31, 82173.340, 1894016.190, 1470.100, 0.150, 1.200, 0.895, 0.438, '1990-09-04', '1730', 'SEC Signal', 'Lions Den'),
  ('1/Q', 'D.R.Church', 'QUART', 'TR9227', '1731C3', 31, -4832.850, 1971620.310, 1500.500, NULL, NULL, NULL, NULL, NULL, '1731', 'Centre of ball', 'Harare'),
  ('1/S', 'Iron Mask', 'SEC', 'TR9874', '1731A3', 31, -10668.800, 1924967.350, 1614.100, 0.150, 1.200, 0.898, 0.444, '1995-04-06', '1731', NULL, 'Glendale'),
  ('10/P', 'Copper King', 'PRIM', 'QL3853', '1729C2', 29, -27661.630, 1945633.790, 914.900, 0.150, 1.200, 0.920, 0.460, '1991-06-16', '1729', 'SEC Signal', 'Sanyati'),
  ('10/Q', 'Dutch Reformed', 'QUART', 'RK0870', '1829B4', 29, -97533.650, 2028401.180, 1167.500, NULL, NULL, NULL, NULL, NULL, '1829', 'Final', 'Kadoma'),
  ('10/S', 'Makori', 'SEC', 'US0600', '1731A1', 31, -18959.600, 1899848.920, 1418.100, 0.150, 1.200, 1.080, 0.617, '1990-10-23', '1731', NULL, 'Mvurwi'),
  ('100/P', 'Chinyamsese', 'PRIM', 'VP0469', '1932A3', 33, 95310.050, 2131550.890, 1193.900, 0.150, 1.200, 0.930, 0.475, '1997-06-18', '1932', 'Pedestal name CHINAMSESE. SEC SIGNAL', 'Mutare'),
  ('100/Q', 'Carbide', 'QUART', 'QK9806', '1829D4', 29, -87888.820, 2092089.130, 1220.100, 0.305, 1.210, 0.918, 0.463, NULL, '1829', 'Height of top of signal', 'Kwekwe'),
  ('100/S', 'Shonikanu', 'SEC', 'RH1883', '2030A1', 29, -109092.990, 2215114.750, 1203.700, 0.150, 1.200, 0.920, 0.460, '1994-10-21', '2030', NULL, 'Zvishavane'),
  ('100/T', 'Stamford W', 'TERT', 'TR7833', '1730D4', 31, 9733.480, 1964755.940, 1479.800, 0.150, 1.200, 0.920, 0.461, '1994-05-20', '1730', NULL, 'Harare'),
  ('1000/S', 'Madanga', 'SEC', 'VP5064', '1932B3', 33, 49587.650, 2136834.310, 1041.100, 0.900, 1.200, 0.934, 0.479, '1988-11-14', '1932', NULL, 'Mutare'),
  ('1001/S', 'Greendale Tank', 'SEC', 'UR0229', '1731C3', 31, -14429.660, 1970064.790, 1585.300, NULL, 1.200, NULL, NULL, '1973-01-01', '1731', 'On top of water tower', 'Harare'),
  ('1002/S', 'Portland', 'SEC', 'UR0827', '1731C3', 31, -21016.620, 1970881.130, 1625.300, NULL, NULL, NULL, NULL, '1967-01-01', '1731', 'Height to top of cement base.', 'Harare'),
  ('1003/S', 'Chipindaumwe', 'SEC', 'VP6060', '1932B3', 33, 39006.770, 2140526.070, 1228.500, 0.150, 1.200, NULL, NULL, '1984-01-01', '1932', NULL, 'Mutare'),
  ('1004/S', 'Binga', 'SEC', 'VP7863', '1932B4', 33, 21864.420, 2137463.390, 1985.200, 0.150, 1.200, 0.932, 0.476, '1984-10-09', '1932', NULL, 'Mutare'),
  ('1005/S', 'Nyamanda', 'SEC', 'VP6668', '1932B3', 33, 32124.590, 2132489.390, 1407.800, 0.150, 1.200, 0.912, 0.451, '1984-10-09', '1932', 'Beacon was rebuilt', 'Mutare'),
  ('1006/S', 'Dandanzara', 'SEC', 'VP4044', '1932A4', 33, 59132.720, 2156549.650, 993.100, 0.150, 1.200, 0.942, 0.485, '1984-10-18', '1932', NULL, 'Mutare'),
  ('1007/S', 'Chipindurwe', 'SEC', 'VP2639', '1932C2', 33, 72993.800, 2161085.260, 1158.600, 0.150, 1.200, 0.930, 0.475, '1997-09-11', '1932', NULL, 'Nyanyadzi')
ON CONFLICT (monu_num) DO NOTHING;
