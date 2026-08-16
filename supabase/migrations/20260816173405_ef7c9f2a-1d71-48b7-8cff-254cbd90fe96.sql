delete from private.auth_throttle where key not like 'login:________________________________'
   or key ~ '[^0-9a-f]' and key like 'login:%';
delete from private.auth_throttle where key = 'login:1084569878';