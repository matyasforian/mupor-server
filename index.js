/**
 * REQUIRES
 */
var express        = require('express');
var multer         = require('multer');
var fs             = require('fs');
var bodyParser     = require('body-parser');
var methodOverride = require('method-override');
var cors           = require('cors');
var elasticsearch  = require('elasticsearch');
var bodybuilder	   = require('bodybuilder');
var excel		   = require('excel4node');
var admin		   = require('firebase-admin');
var upload         = multer({ dest: 'uploads/' });
var sizeOf		   = require('image-size');

var app = express();
var router = express.Router();

/**
 * DEFS
 */
var whitelist = [
		'http://localhost:4200',
		'http://localhost:4200/',
		'http://mupor.hopto.org:3000',
		'http://mupor.hopto.org:8888',
		'http://mupor.hopto.org:8888/'
	];

var corsOptions = {
	origin: function (origin, callback) {
		if (whitelist.indexOf(origin) !== -1) {
			callback(null, true)
		} else {
			callback(new Error('Not allowed by CORS'))
		}
	},
	credentials: true
};

var firebaseAccount = require('./mupo-49550-905bdbeba906');

var resolutions = [
    {name: 'preview_s', height: 375},
    {name: 'preview_m', height: 768},
    {name: 'preview_l', height: 1080},
    {name: 'preview_xl', height: 2880},
    {name: 'raw', height: undefined}
];

var directories = [
	'preview_s',
	'preview_m',
	'preview_l',
	'preview_xl',
	'raw',
	'video',
	'audio',
	'other'
];
var INFO_FIELDS = ['shortInformation', 'information', 'extraInformation', 'description'];

var client = new elasticsearch.Client({
	host: 'http://35.234.124.26//elasticsearch',
    httpAuth: 'user:g98RWffDMGVwGRUK'
});

admin.initializeApp({
	credential: admin.credential.cert(firebaseAccount)
});
var db = admin.firestore();
db.settings({timestampsInSnapshots: true});

/**
 * USES
 */
app.use(function(req, res, next) {
	req.headers.origin = req.headers.origin || req.headers.referer;
	next();
});

app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

makeDir('images');
makeDir('uploads');

/**
 * ENDPOINTS
 */
app.post('/:artist/addFile', upload.single('file'), function (req, res, next) {
	try {
		var start = new Date();
		var artist = req.params.artist;
		var file = req.file.originalname;
        var size = req.body.size || 'raw'; // image needs to have size, or default will be "raw" directory

		checkCreatedDirs(artist).then(function () {
            fs.createReadStream(req.file.path).pipe(fs.createWriteStream('images/' + artist + '/' + size + '/' + file));
            deleteFile(req.file.path);

            console.log('File uploaded: ', artist, file, new Date() - start);
            res.status(200).send({result: 'success', link: req.file.originalname});
		});
	} catch (error) {
    	console.error('Error found while file upload', req.body.artist, req.file.originalname, error);
		next(error);
	}
});

app.delete('/deleteImage/:artist/:image', function(req, res) {
	try {
	    var deleted = 0;
		resolutions.forEach(function(val) {
			var path = 'images/' + req.params.artist + '/' + val.name + '/' + req.params.image;
			deleteFile(path);
			deleted++;
		});
        console.log('Images deleted', req.params.artist, req.params.image, deleted);
        res.status(200).send({result: 'success'});
	} catch (error) {
    	console.error('Error found while delete images', req.params.artist, req.params.image, error);
		next(error);
	}
});

app.delete('/deleteFile/:artist/:file', function(req, res) {
	try {
        deleteFile('images/' + req.params.artist + '/raw/' + req.params.file);
        console.log('File deleted', req.params.artist, req.params.file);
        res.status(200).send({result: 'success'});
	} catch (error) {
    	console.error('Error found while delete file', req.params.artist, req.params.file, error);
		next(error);
	}
});

app.post('/search', function (req, res) {
	var searchObj = {
		index: 'items',
		type: 'item'
	};

	var body = bodybuilder();

	if (req.body) {
		body.query('match', 'authorId', req.body.authorId);
		body.query('match', 'collectionId', req.body.collectionId);
		if (req.body.query) {
			if (req.body.type === 'title') {
				body.query('match_phrase_prefix', 'title', req.body.query);
			} else {
				body.query('dis_max', {
					tie_breaker: 0.7,
					boost: 1.2,
					queries: [
						{multi_match: {
							query: req.body.query,
							type: 'phrase_prefix',
							fields: ['title^3', 'FIELD_*']
						}},
						{multi_match: {
							query: req.body.query,
							type: 'phrase_prefix',
							fields: INFO_FIELDS
						}}
					]
				});

				body.rawOption('highlight', {
					fragment_size: 40,
					pre_tags: ['<mark>'],
					post_tags: ['</mark>'],
					fields: {
						'title': {},
						'FIELD_*': {},
						'information': {},
						'extraInformation': {},
						'shortInformation': {},
						'description': {}
					}
				})
			}
		}
		if (req.body.sort) {
			body.sort(req.body.sort.field, req.body.sort.order);
		}
		if (req.body.from) {
			body.from(req.body.from);
		}
		if (req.body.size) {
			body.size(req.body.size);
		}
		if (req.body.specialSiteIncluded) {
			body.query('match', 'isSpecialSite', true);
		} else {
			body.notQuery('match', 'isSpecialSite', true);
		}
	}

	searchObj.body = body.build();

	client.search(searchObj).then(function (result) {
		res.status(200).send(result.hits);
	});
});

var specialFields = {
	type: {width: 10},
	shortInformation: {width: 20},
	information: {width: 25},
	extraInformation: {width: 25},
	description: {width: 25}
};

app.get('/excel/:authorId', function (req, res) {
	var authorRef = db.collection('authors').doc(req.params.authorId);
	var wb = new excel.Workbook();

	var headerStyle = wb.createStyle({
		alignment: {
            shrinkToFit: true
		},
		font: {
			bold: true
		}
	});

	var cellStyle = wb.createStyle({
		alignment: {
			wrapText: true,
            vertical: 'top'
		}
	});

    authorRef.collection('collections').get().then(function (snapshot) {

    	var promises = snapshot.docs.map(function (collection) {
    		return new Promise(function (resolve, reject) {
                var ws = wb.addWorksheet(collection.data().name, {sheetFormat: {defaultRowHeight: 130}});

                var columnMap = {};
                var columnCount = 1;

                console.log('starting worksheet: ', collection.data().name);
                columnMap['title'] = 1;
                ws.cell(1, 1).string('title').style(headerStyle);
                ws.row(1).setHeight(30);

                authorRef.collection('collections').doc(collection.id).collection('items').get().then(function (items) {

                	// Normal fields
                	var itemIndex = 2;
                    items.forEach(function (itemDoc) {
                        var item = itemDoc.data();

                        item.fields.forEach(function (field) {
                            if (columnMap[field.id] === undefined || columnMap[field.id] === null) {
                                columnMap[field.id] = ++columnCount;
                                console.log('writing header: ', 1, columnMap[field.id], field.id);
                                ws.cell(1, columnMap[field.id]).string(field.id).style(headerStyle);
                            }
                            console.log('writing data:', itemIndex + 1, columnMap[field.id], item[field.id]);
                            ws.cell(itemIndex, columnMap[field.id]).string(item[field.id] || '').style(cellStyle);
                        });
                        itemIndex++;
                    });

                    // Special fields
                    itemIndex = 2;
                    Object.keys(specialFields).forEach(function (field) {
                    	columnMap[field] = ++columnCount;
                    	ws.cell(1, columnMap[field]).string(field).style(headerStyle);
                    	ws.column(columnCount).setWidth(specialFields[field].width);
					});

                    items.forEach(function (itemDoc) {
                    	var item = itemDoc.data();
                        Object.keys(specialFields).forEach(function (field) {
                            ws.cell(itemIndex, columnMap[field]).string(item[field] || '').style(cellStyle);
						});
                        itemIndex++;
                    });

                    // Images
					itemIndex = 2;

					var maxWidthCm = 7.47;
					var maxHeightCm = 4.54;
					var originalProportions = maxWidthCm / maxHeightCm;

					items.forEach(function (itemDoc) {
						var item = itemDoc.data();
                        var currentCol = columnCount;

                        if (!item.files.images) {
							item.files.images = [];
						}
						item.files.images.unshift(item.files.mainImage);

                        item.files.images.forEach(function (image) {
                            var fromCol = currentCol + 1;
                            var toCol = fromCol + 1;

                            var imagePath = './images/' + image.authorId + '/preview_s/' + image.fileName;
                            if (!fs.existsSync(imagePath)) {
                            	return;
							}

                            var dimensions = sizeOf(imagePath);
                            var proportions = dimensions.width / dimensions.height;

                            var proportionScale = originalProportions / proportions;
                            var colOff = 1 + (1 / proportionScale) * maxWidthCm;

                            ws.addImage({
                                path: imagePath,
                                type: 'picture',
                                position: {
                                    type: 'twoCellAnchor',
									from: {
										col: fromCol,
										colOff: '1cm',
										row: itemIndex,
										rowOff: '0cm'
									},
									to: {
										col: fromCol,
										colOff: colOff + 'cm',
										row: itemIndex,
										rowOff: maxHeightCm + 'cm'
									}
                                }
                            });
                            ws.column(fromCol).setWidth(40);
                            currentCol++;
						});
						itemIndex++;
                    });

                    resolve();
                });
            });
		});

    	Promise.all(promises).then(function () {
            console.log('sending xlsx..');
            wb.write('export.xlsx', res)
		});

    });
});

/**
 * LISTEN
 */
app.use(function (err, req, res, next) {
    console.error('err', err);
    res.status(500).send({ error: err });
});
app.use(express.static('images'));
app.use(function(req, res, next) {
    res.status(404).send("Undefined url");
});

app.listen(3000, function () {
  console.log('MUPOR server listening on port 3000!')
});

/*
 * FUNCTIONS
 */

function deleteFile(filePath) {
   fs.unlink(filePath,function(err){
        if(err) {
            return console.error('Error found while delete file ', filePath, err);
        }
        console.log('File deleted successfully', filePath);
   });
}

function checkCreatedDirs(artist) {
	return new Promise(function(resolve, reject) {
        var dir = 'images/' + artist;
        makeDir(dir);
        directories.forEach(function (directoryName) {
            var dir = 'images/' + artist + '/' + directoryName;
            makeDir(dir);
        });
        resolve();
    });
}

function makeDir(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, 0744);
		return true;
	} else {
		return false;
	}
}
