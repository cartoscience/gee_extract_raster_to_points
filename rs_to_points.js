// Comment
var startYear = 2012;
var endYear = 2017;
var fileName = 'rs_to_points';

// Excel formatting command: =CONCATENATE("ee.Feature(ee.Geometry.Point(",A1,",",B1,")),")

// Comment
var features = [
  ee.Feature(ee.Geometry.Point(33.10205078125,-2.73270832133583)),
  ee.Feature(ee.Geometry.Point(35.10205078125,-1.73270832133583)),
  ee.Feature(ee.Geometry.Point(37.10205078125,-0.73270832133583)),
  ee.Feature(ee.Geometry.Point(39.10205078125,0.26729167866417)),
  ee.Feature(ee.Geometry.Point(41.10205078125,1.26729167866417))
];

// Comment
var sites = ee.FeatureCollection(features);
var region = sites.geometry().bounds().buffer(10000);

// Comment
var years = ee.List.sequence(startYear, endYear);
var yearName = startYear+'_'+endYear;

// Comment
var elevation = ee.Image('CGIAR/SRTM90_V4').select('elevation')
                  .clip(region)
                  .rename('band').set('extract','elevation_'+yearName);

// Comment
var slope = ee.Terrain.slope(elevation)
                      .rename('band').set('extract','slope_'+yearName);

// Comment
var ndviMean = ee.ImageCollection('MODIS/006/MOD13Q1').select('NDVI')
                      .filter(ee.Filter.calendarRange(startYear,endYear,'year'))
                      .mean().clip(region).multiply(0.0001) // Comment
                      .rename('band').set('extract', 'ndvi_'+yearName);

// Comment
var precipitation = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD').select('precipitation')
                      .filter(ee.Filter.calendarRange(startYear,endYear,'year'));

// Comment
var annualPrecipitation = ee.ImageCollection.fromImages(
  years.map(function (y) {
    return precipitation.filter(ee.Filter.calendarRange(y,y,'year'))
                        .sum().clip(region)
                        .set('year',y);
                        
  })
);

// Comment
var annualPrecipMean = annualPrecipitation.mean()
                                          .rename('band').set('extract','precipMean_'+yearName);

// Comment
Map.addLayer(annualPrecipMean.rename('precipitation'),{},'precipitation',false);
Map.addLayer(elevation.rename('elevation'),{},'elevation',false);
Map.addLayer(slope.rename('slope'),{},'slope',false);
Map.addLayer(ndviMean.rename('ndvi'),{},'ndvi',false);
Map.addLayer(sites,{},'points');
Map.addLayer(ee.Image().byte().paint({featureCollection: region, color: 'black', width: 2}),{},'bounds');
Map.centerObject(region);

// Comment
var imageToCollection = ee.ImageCollection.fromImages([annualPrecipMean,elevation,slope,ndviMean]);

// Temporary solution to export zero values as a float approximating zero so that it doesn't appear as no data
var exportCollection = imageToCollection.map(function(img){
                         return img.where(img.updateMask(img.eq(0)).add(1),1e-10);
                       });

// Comment
var featureCollection = sites; 
var extractToPoints = function(feature) {
  var geom = feature.geometry();
  var addField = function(image, f) {
    var newFeature = ee.Feature(f);
    var getName = image.get('extract');
    var setValue = image.reduceRegion(ee.Reducer.first(), geom, 5).get('band');
    return ee.Feature(ee.Algorithms.If(setValue,
                                       newFeature.set(getName, ee.String(setValue)),
                                       newFeature.set(getName, ee.String('No data'))));
  };
  var newFeature = ee.Feature(exportCollection.iterate(addField, feature));
  return newFeature;
};

// Comment
var extraction = featureCollection.map(extractToPoints);

// Comment
Export.table.toDrive({
  collection: extraction,
  folder: 'GEE_export',
  description: fileName+'_'+yearName
});

// Comment
var tsDisplay = {
  title: 'Annual CHIRPS Precipitation',
  fontSize: 12,
  hAxis: {title: 'Year', format: '0000'},
  vAxis: {title: 'Precipitation', 
    viewWindow: {}},
    trendlines: {0: {color: 'black', visibleInLegend: true}},
  series: {0: {color: 'blue'}}
};
print(ui.Chart.image.series(annualPrecipitation, region, ee.Reducer.mean(), 5000, 'year').setOptions(tsDisplay));

// Comment
var histDisplay = {
  title: 'Mean MODIS NDVI',
  fontSize: 12,
  hAxis: {title: 'NDVI'},
  vAxis: {title: 'Count'},
  series: {0: {color: 'green'}}
};
print(ui.Chart.image.histogram(ndviMean.rename('NDVI'), region, 5000).setOptions(histDisplay));
