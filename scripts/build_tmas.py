"""Build a December 2023 historical station sample, never annualized.
Inputs: official FHWA station and volume ZIPs and BTS station FeatureServer export.
Only complete 24-hour rows without restriction flags are used. Conflicting
station/dir/lane/date duplicates are excluded. Choose ONE stream per station,
by most valid dates, then aggregate lane code 0, then direction/lane order.
No addition across lanes/directions; no imputation for missing dates/hours.
"""
import csv,io,json,zipfile,datetime,pathlib,collections
root=pathlib.Path(__file__).resolve().parent
meta={};fips={}
with zipfile.ZipFile(root/'2023_station_data.zip') as z:
 for name in z.namelist():
  abbr=name[:2]
  for row in csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig',errors='replace'),delimiter='|'):
   fips[int(row['state_code'])]=abbr
   meta[(abbr,row['station_id'].strip().zfill(6))]=row
coords={}
for feature in json.loads((root/'stations.json').read_text()):
 a=feature['attributes'];coords[(a['state'].strip(),a['Station_Id'].strip().zfill(6))]=(a['latitude'],a['longitude'])
streams=collections.defaultdict(dict);conflicts=set()
with zipfile.ZipFile(root/'dec_2023_ccs_data.zip') as z:
 for name in z.namelist():
  for row in csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig',errors='replace'),delimiter='|'):
   try:
    if row['restrictions'].strip():continue
    date=datetime.date(int(row['year_record']),int(row['month_record']),int(row['day_record']))
    if date.year!=2023 or date.month!=12:continue
    hours=tuple(int(row[f'hour_{i:02}']) for i in range(24))
    if min(hours)<0:continue
    abbr=fips[int(row['state_code'])];sid=row['station_id'].strip().zfill(6)
    key=(abbr,sid,row['travel_dir'].strip(),row['travel_lane'].strip())
    if (key,date) in conflicts:continue
    old=streams[key].get(date)
    if old is not None and old!=hours:
     del streams[key][date];conflicts.add((key,date));continue
    streams[key][date]=hours
   except (ValueError,KeyError):continue
chosen={}
for key,days in streams.items():
 if len(days)<14:continue
 station=key[:2];score=(-len(days),key[3]!='0',key[2],key[3])
 if station not in chosen or score<chosen[station][0]:chosen[station]=(score,key,days)
records=[]
for station,(_,key,days) in sorted(chosen.items()):
 if station not in coords:continue
 lat,lon=coords[station]
 if not isinstance(lat,(int,float)) or not isinstance(lon,(int,float)) or not (18<=lat<=72 and -180<=lon<=-60):continue
 m=meta.get(station,{})
 def profile(kind):
  selected=[h for d,h in days.items() if kind=='all' or ((d.weekday()<5)==(kind=='weekday'))]
  return {'days':len(selected),'hours':[round(sum(h[i] for h in selected)/len(selected),1) for i in range(24)] if selected else None}
 records.append({'state':station[0],'id':station[1],'lat':lat,'lon':lon,'location':m.get('station_location','').strip(),'route':m.get('posted_signed_route','').strip(),'direction':key[2],'lane':key[3],'start':str(min(days)),'end':str(max(days)),'profiles':{k:profile(k) for k in ['all','weekday','weekend']}})
out={'period':'2023-12','source':'https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/','minimumCompleteDays':14,'stations':records}
(root/'output/tmas-dec-2023.json').write_text(json.dumps(out,separators=(',',':')))
print('Stations with matched coordinates and >=14 complete days:',len(records),'bytes:',(root/'output/tmas-dec-2023.json').stat().st_size)
# Publish small state shards; the browser fetches only the states it needs.
groups=collections.defaultdict(list)
for s in records:groups[s['state']].append(s)
public=root/'output/data/tmas';public.mkdir(parents=True,exist_ok=True)
(public/'index.json').write_text(json.dumps({'period':'2023-12','stations':[[s['state'],s['id'],s['lat'],s['lon']] for s in records]},separators=(',',':')))
for state,stations in groups.items():(public/(state+'.json')).write_text(json.dumps({'period':'2023-12','stations':stations},separators=(',',':')))
