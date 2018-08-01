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
var upload         = multer({ dest: 'uploads/' });

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

var resolutions = [
    {name: 'preview_xxs', height: 375},
    {name: 'preview_xs', height: 768},
    {name: 'preview_s', height: 1080},
    {name: 'preview_m', height: 1600},
    {name: 'preview_l', height: 2160},
    {name: 'preview_xl', height: 2880},
    {name: 'raw', height: undefined}
];


var client = new elasticsearch.Client({
	host: 'http://35.234.124.26//elasticsearch',
    log: 'trace',
    httpAuth: 'user:g98RWffDMGVwGRUK'
});

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

		console.log('add file', req.file, req.body);

		var dir = checkCreateDirs(artist);
        fs.createReadStream(req.file.path).pipe(fs.createWriteStream('images/' + artist + '/' + size + '/' + file));
        deleteFile(req.file.path);
        console.log('File uploaded', req.body.artist, req.file.originalname, new Date() - start);
        res.status(200).send({result: 'success', link: req.file.originalname});
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
		if (req.body.query) {
			body.query('prefix', 'title', req.body.query);
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
	}

	searchObj.body = body.build();

	client.search(searchObj).then(function (result) {
		res.status(200).send(result.hits);
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

function checkCreateDirs(artist) {
	var dir = 'images/' + artist;
	if (makeDir(dir)) {
		resolutions.forEach(function(val) {
			var dir = 'images/' + artist + '/' + val.name;
			makeDir(dir);
		});
	}
	return dir;
}

function makeDir(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, 0744);
		return true;
	} else {
		return false;
	}
}
