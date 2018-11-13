// Input variables
var startYear = 2012;
var endYear = 2017;
var fileName = 'rs_to_points';

// Use excel to build a set of coordinates that Earth Engine can understand
// Excel formatting command: =CONCATENATE("ee.Feature(ee.Geometry.Point(",B1,",",C1,")).set('1_id','",A1,"'),")
// Structure columns in this order: A - ID field; B - longitude; C - latitude

// Replace these coordinates with the ones you generated
var features = [
  ee.Feature(ee.Geometry.Point(33.10205078125,-12.73270832133583)).set('1_id','1401'),
  ee.Feature(ee.Geometry.Point(35.10205078125,-11.73270832133583)).set('1_id','1402'),
  ee.Feature(ee.Geometry.Point(37.10205078125,-10.73270832133583)).set('1_id','1403'),
  ee.Feature(ee.Geometry.Point(39.10205078125,-10.26729167866417)).set('1_id','1404')
];

// Converts a list of points to a feature collection
var sites = ee.FeatureCollection(features);
//  Creates a bounding box around your sites
var region = sites.geometry().bounds().buffer(10000);

// Creates a list of years from the input parameters
var years = ee.List.sequence(startYear, endYear);
// Naming label
var yearName = startYear+'_'+endYear;

// Load the elevation imagery, clip to your area, rename properties for table export
var elevation = ee.Image('CGIAR/SRTM90_V4').select('elevation')
                  .clip(region)
                  .rename('band').set('extract','elevation');

// Calculate slope and rename properties for table export
var slope = ee.Terrain.slope(elevation)
                      .rename('band').set('extract','slope');

// Load NDVI data, calculate the average across all years, and rename properties for table export
var ndviMean = ee.ImageCollection('MODIS/006/MOD13Q1').select('NDVI')
                      .filter(ee.Filter.calendarRange(startYear,endYear,'year'))
                      .mean().clip(region).multiply(0.0001) // Scale factor to convert from integer to float
                      .rename('band').set('extract', 'ndvi_mean');

// Load precipitation data
var precipitation = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD').select('precipitation')
                      .filter(ee.Filter.calendarRange(startYear,endYear,'year'));

// Iterate over the list of years to return total annual rainfall
var annualPrecipitation = ee.ImageCollection.fromImages(
  years.map(function (y) {
    return precipitation.filter(ee.Filter.calendarRange(y,y,'year'))
                        .sum().clip(region)
                        .set('year',y);               
  })
);

// Calculate the average annual rainfall amount and rename properties for table export
var annualPrecipMean = annualPrecipitation.mean()
                                          .rename('band').set('extract','precip_mean');

// Add layers to display
Map.addLayer(annualPrecipMean.rename('precipitation'),{},'precipitation',false);
Map.addLayer(elevation.rename('elevation'),{},'elevation',false);
Map.addLayer(slope.rename('slope'),{},'slope',false);
Map.addLayer(ndviMean.rename('ndvi'),{},'ndvi',false);
Map.addLayer(sites,{},'points');
Map.addLayer(ee.Image().byte().paint({featureCollection: region, color: 'black', width: 2}),{},'bounds');
Map.centerObject(region);

// Create an image collection from the images desired for export
var imageToCollection = ee.ImageCollection.fromImages([annualPrecipMean,elevation,slope,ndviMean]);

// *** Temporary solution to export zero values as a float approximating zero so that they don't appear as no data
var exportCollection = imageToCollection.map(function(img){
                         return img.where(img.updateMask(img.eq(0)).add(1),1e-10);
                       });

// Function to attach raster data to each feature
var featureCollection = sites; 
var extractToPoints = function(feature) {
  var geom = feature.geometry();
  var addField = function(image, f) {
    var newFeature = ee.Feature(f);
    // Get the label name
    var getName = image.get('extract');
    // Get the raster value at the point
    var setValue = image.reduceRegion(ee.Reducer.first(), geom, 5).get('band');
    // Add the value to the feature properties
    return ee.Feature(ee.Algorithms.If(setValue,
                                       newFeature.set(getName, ee.String(setValue)),
                                       newFeature.set(getName, ee.String('No data'))));
  };
  var newFeature = ee.Feature(exportCollection.iterate(addField, feature));
  return newFeature;
};

// Run the iteration function for each feature in the feature collection
var extraction = featureCollection.map(extractToPoints);

// Export CSV to Google Drive -- check task tab to download CSV
Export.table.toDrive({
  collection: extraction,
  folder: 'GEE_export',
  description: fileName+'_'+yearName
});

// Create time-series chart display and print to console
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

// Create histogram display and print to console
var histDisplay = {
  title: 'Mean MODIS NDVI',
  fontSize: 12,
  hAxis: {title: 'NDVI'},
  vAxis: {title: 'Count'},
  series: {0: {color: 'green'}}
};
print(ui.Chart.image.histogram(ndviMean.rename('NDVI'), region, 5000).setOptions(histDisplay));

// Print data table to console
print(extraction);
