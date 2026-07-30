-- Remove the temporary rooftop candidate that had no registered photo or guide.
-- Related photo_guides are removed by the existing FK cascade if any were created.
delete from public.photo_spots
where external_key = 'daegu-rooftop-pending'
   or name = '대구 옥상 포토스팟 (사진 등록 예정)';
