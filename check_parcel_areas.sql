-- Check parcel areas and geometry validity
SELECT 
    id,
    stand,
    designation,
    ST_SRID(geom) as srid,
    ST_IsValid(geom) as is_valid,
    ST_GeometryType(geom) as geom_type,
    ST_NPoints(geom) as num_points,
    ST_Area(geom) as area_m2_calculated,
    area_m2 as area_m2_stored,
    area_ha,
    ST_AsText(ST_Envelope(geom)) as bbox
FROM surveyor_kuziva_paradzayi.land_parcels
WHERE stand IN ('2474', '2475', '2476')
   OR designation LIKE '%Outside Figure%'
ORDER BY id;
