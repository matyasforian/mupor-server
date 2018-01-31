var express        = require('express');
var multer         = require('multer');
var fs             = require('fs');
var gm             = require('gm');
var bodyParser     = require('body-parser');
var methodOverride = require('method-override');
var cors           = require('cors');
var upload         = multer({ dest: 'uploads/' });

var app = express();
var router = express.Router();
app.use(cors());
var start = 0;

var resolutions = [
    {name: 'preview_xxs', height: 375},
    {name: 'preview_xs', height: 768},
    {name: 'preview_s', height: 1080},
    {name: 'preview_m', height: 1600},
    {name: 'preview_l', height: 2160},
    {name: 'preview_xl', height: 2880},
    {name: 'raw', height: undefined}
];

makeDir('images');
makeDir('uploads');

app.get('/test', function(req, res) {
	console.log('test called');
	res.json({ message: 'hooray! welcome to our api!' });   
});

app.post('/add', upload.single('image'), function (req, res, next) {
	try {
		start = new Date().getTime();
		console.log('add image', req.file, req.body);
		processImage(req.file.path, req.file.originalname, req.body.artist).then(function(result) {
			res.status(200).send({test: 'profile'});
			console.log('SUCCESS', new Date().getTime() - start);
		}, function(reason) {
			next(reason);
		});
	} catch (error) {
		next(error);
	}
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

app.use(function (err, req, res, next) {
	console.error('err', err);
	res.status(500).send({ error: err });
});

app.use(express.static('images'));

app.use(function(req, res, next) {
	res.status(404).send("Undefined url");
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
});

function checkCreateDirs(artist) {
	let dir = 'images/' + artist;
	if (makeDir(dir)) {
		resolutions.forEach(function(val) {
			let dir = 'images/' + artist + '/' + val.name;
			makeDir(dir);
		});
	}
}

function makeDir(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, 0744);
		return true;
	} else {
		return false; 
	}
}

function processImage(filePath, file, artist) {
	if (!artist) {
		throw 'artist not defined';
	}
	return new Promise((resolve, reject) => {
		checkCreateDirs(artist);
		gm(filePath)
			.identify(function (err, features) {
				if (err) {
					console.log(filePath)
					console.log(err)
					reject(err);
				}

				// copy raw image to assets folder
				fs.createReadStream(filePath).pipe(fs.createWriteStream('images/' + artist + '/raw/' + file));
				let promises = [];
				for (let i=0; i<resolutions.length-2; i++) {
					let r = resolutions[i];
					promises.push(createPreviewImage(filePath, file, r.height, r.name, artist));
				}
				Promise.all(promises).then(function(val) {
					resolve(true);
				}, function(reason) {
					reject(reason);
				});
			});
	});
}

function createPreviewImage(filePath, file, rheight, rname, artist) {
	return new Promise((resolve, reject) => {
		gm(filePath)
			.resize(null, rheight)
			.quality(95)
			.autoOrient()
			.write('images/' + artist + '/' + rname + '/' + file, function (err) {
				if (err) 
					reject(err)
				else 
					resolve(true);
			});
	});
    // create various preview images

}
