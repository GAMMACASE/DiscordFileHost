import "../scss/main.scss"
import "../icons/file.svg"

import { Toast } from 'bootstrap'

const toastPlaceholder = document.querySelectorAll('div#toast-placeholder')[0];
const toastMessages = [];

const existingFilePlaceholder = document.querySelectorAll('tr#existing-file-row-placeholder')[0];
const noExistingFilesRow = document.querySelectorAll('tr#no-files-row')[0];

const uploadingFilePlaceholder = document.querySelectorAll('div#uploading-file-placeholder')[0];
const uploadingFilesSeparator = document.querySelectorAll('div#uploading-files-separator')[0];

const existingFiles = [];
const uploadingFiles = [];

const uploadFileStopEvent = new Event('upload-stop');

const selectFilesInput = document.querySelectorAll('input#select-files-input')[0];

const loggedInInformation = document.querySelectorAll('div#logged-in-information')[0];

let authedAs;

let nonAuthorizedWarningShown = false;

selectFilesInput.addEventListener('change', () => {
	if(uploadingFiles.length + selectFilesInput.files.length > 5) {
		createToastMessage('Only 5 files per upload is allowed!', true);
		return;
	}

	uploadFiles(selectFilesInput.files);
});

const selectFilesButton = document.querySelectorAll('#select-files-button')[0];
selectFilesButton.onclick = () => selectFilesToUpload(selectFilesButton);

function selectFilesToUpload(elem) {
	selectFilesInput.click();
}

// Ehh? https://stackoverflow.com/questions/7110353/html5-dragleave-fired-when-hovering-a-child-element
let draggingCounter = 0;

const mainBody = document.querySelectorAll('body#main-body')[0];
mainBody.ondrop = (event) => dropHandler(mainBody, event);
mainBody.ondragover = (event) => dragOverHandler(event);
mainBody.ondragenter = () => dragStart(mainBody);
mainBody.ondragleave = () => dragLeave(mainBody);

function dropHandler(elem, event) {
	draggingCounter = 0;
	elem.classList.remove('file-drop-zone');

	event.preventDefault();

	let files;
	try {
		files = [...event.dataTransfer.items]
			.filter(x => !x.webkitGetAsEntry().isDirectory)
			.map(x => x.getAsFile());
	}
	catch(e) {}
	
	if(!files || files.length === 0)
		return;
	
	uploadFiles(files);
}

function dragLeave(elem) {
	if(--draggingCounter === 0)
		elem.classList.remove('file-drop-zone');
}

function dragStart(elem) {
	if(draggingCounter++ === 0)
		elem.classList.add('file-drop-zone');
}

function dragOverHandler(event) {
	event.preventDefault();
}

function createToastMessage(message, warn = false, autoHide = true) {
	let elem = toastPlaceholder.cloneNode(true);

	elem.classList.remove('d-none');
	toastPlaceholder.parentNode.appendChild(elem);

	elem.querySelectorAll('#toast-message-field')[0].innerHTML = message;

	if(warn)
		elem.classList.add('text-bg-danger');
	else
		elem.classList.add('text-bg-success');

	const toastElem = new Toast(elem, {
		autohide: autoHide
	});
	toastElem.show();

	const removeHiddenToast = (e) => {
		const idx = toastMessages.findIndex(x => x[0] === elem);
		if(idx !== -1)
			toastMessages.splice(idx, 1);
		elem.remove();	
	}

	toastMessages.push([elem, removeHiddenToast]);
	elem.addEventListener('hidden.bs.toast', removeHiddenToast);

	while(toastMessages.length > 3) {
		const telem = toastMessages.shift();
		if(telem[0]) {
			telem[0].removeEventListener('hidden.bs.toast', telem[1]);
			telem[0].remove();
		}
	}
}

function deleteExistingFileRequest(elem) {
	const url = new URL(elem.querySelectorAll('a#filename_link-field')[0].getAttribute('href'), window.location.href);

	fetch(url, { method: 'DELETE' }).then((res) => {
		if(res.ok) {
			deleteExistingFileEntry(elem);
		}
	}).catch(e => {
		console.error('Failed to delete file. Error:', e);
		createToastMessage('Failed to delete file!', true);
	})
}

async function showCopiedSuccessfullToast(elem) {
	const url = new URL(`f/${elem.metadata.ident}`, window.location.href);
	
	const permState = await navigator.permissions.query({
		name: 'clipboard-write'
	});

	if(navigator.clipboard && permState.state === 'granted') {
		navigator.clipboard.writeText(url).then(() => {
			createToastMessage('Link copied');
		});
	}
	else if(fallbackCopyTextToClipboard(url)) {
		createToastMessage('Link copied');
	}
}

function createUploadingFileEntry(filename, bytes) {
	const elem = uploadingFilePlaceholder.cloneNode(true);

	elem.classList.remove('d-none');

	elem.querySelectorAll('#stop-upload-button')[0].onclick = () => stopFileUpload(elem);

	elem.querySelectorAll('#filename-field')[0].innerHTML = filename;
	elem.querySelectorAll('#filesize-field')[0].innerHTML = humanFileSize(bytes, false, 2);
	const statusElem = elem.querySelectorAll('#uploadstatus-field')[0];
	statusElem.innerHTML = 'Starting...';

	const progressElem = elem.querySelectorAll('#progressbar-field')[0];

	if(uploadingFilesSeparator.classList.contains('d-none')) {
		uploadingFilesSeparator.classList.remove('d-none');
	}

	elem.setStatus = (status) => {
		statusElem.innerHTML = status;
	};

	elem.setProgress = (percantage) => {
		const perc = Math.min(Math.max(percantage, 0), 100);

		progressElem.style.width = `${perc}%`;
		progressElem.setAttribute('aria-valuenow', perc);
	};

	uploadingFiles.push(elem);
	uploadingFilesSeparator.parentNode.insertBefore(elem, uploadingFilesSeparator);
	return elem;
}

function deleteUploadingFileEntry(elem) {
	const idx = uploadingFiles.indexOf(elem);
	uploadingFiles.splice(idx, 1);
	elem.remove();

	if(uploadingFiles.length === 0) {
		uploadingFilesSeparator.classList.add('d-none');
	}
}

function stopFileUpload(elem) {
	elem.dispatchEvent(uploadFileStopEvent);
}

function createExistingFileEntry(filename, ident, bytes, date, views) {
	const elem = existingFilePlaceholder.cloneNode(true);

	elem.classList.remove('d-none');

	elem.querySelectorAll('#copy-link-button-field')[0].onclick = () => showCopiedSuccessfullToast(elem);
	elem.querySelectorAll('#delete-button-field')[0].onclick = () => deleteExistingFileRequest(elem);

	const dotPos = filename.lastIndexOf('.');
	elem.querySelectorAll('#filename-field')[0].textContent = filename.slice(0, dotPos === -1 ? filename.length : dotPos);
	elem.querySelectorAll('#filename_link-field')[0].setAttribute('href', `./api/files/${ident}`);
	elem.querySelectorAll('#filename_ext-field')[0].textContent = (dotPos === -1 ? '' : filename.slice(dotPos));

	elem.querySelectorAll('#download-button-field')[0].setAttribute('href', `./api/files/${ident}`);
	elem.querySelectorAll('#filesize-field')[0].innerHTML = humanFileSize(bytes, false, 2);
	elem.querySelectorAll('#date-field')[0].innerHTML = new Date(date).toLocaleString();
	elem.querySelectorAll('#views-field')[0].innerHTML = views;

	if(existingFiles.length === 0) {
		noExistingFilesRow.classList.add('d-none');
	}

	elem.metadata = {
		filename, ident, size: bytes, date, views
	};

	existingFiles.push(elem);
	existingFilePlaceholder.parentNode.insertBefore(elem, noExistingFilesRow.nextSibling);
	return elem;
}

function deleteExistingFileEntry(elem) {
	const idx = existingFiles.indexOf(elem);
	existingFiles.splice(idx, 1);
	elem.remove();

	if(existingFiles.length === 0) {
		noExistingFilesRow.classList.remove('d-none');
	}
}

function uploadFiles(files) {
	for(const file of files) {
		if(file.size <= 0 || file.size >= (2 * 1024 * 1024 * 1024)) {
			createToastMessage(`Failed to upload ${file.name}, as it has invalid size!`, true);
			continue;
		}

		sendHTTPRequest(file);
	}
}

function sendHTTPRequest(file) {
	const fileElem = createUploadingFileEntry(file.name, file.size);
	const request = new XMLHttpRequest();
	const formdata = new FormData();

	formdata.append('file', file);

	fileElem.addEventListener('upload-stop', () => {
		request.abort();
		fileElem.setStatus('Aborted');

		fileOperationCompleted(fileElem);
	});

	request.upload.addEventListener('progress', function (e) {
		if(e.loaded === e.total) {
			fileElem.setStatus('Processing...');
			fileElem.setProgress(99);
		}
		else {
			fileElem.setStatus('Uploading...');
			fileElem.setProgress(e.loaded / file.size * 100);
		}
	});
	
	request.addEventListener('load', (req) => {
		if(req.target.status !== 200) {
			console.error('Failed to upload file, got bad request status:', req.target.status);
			fileOperationFailed(file.name, fileElem);
			return;
		}

		const response = JSON.parse(req.target.responseText);
		if(!response || !response.idents || response.idents.length !== 1) {
			console.error('Failed to upload file, got bad return type:', response);
			fileOperationFailed(file.name, fileElem);
			return;
		}

		fileElem.setStatus('Uploaded');
		fileElem.setProgress(100);
		
		createExistingFileEntry(file.name, response.idents[0].ident, file.size, Date.now(), 0);
		
		fileOperationCompleted(fileElem);

		if(!isLoggedIn() && !nonAuthorizedWarningShown) {
			createToastMessage('Make sure to log in to keep track of uploaded files! <br><b>Refreshing browser cookies or clearing cache would prevent you from accessing uploaded files!</b>', true, false);
			nonAuthorizedWarningShown = true;
		}
	});

	request.addEventListener('error', (err) => {
		console.error('Failed to upload file, got error:', err);
		fileOperationFailed(file.name, fileElem);
	});

	request.open('post', `./api/files`);
	request.send(formdata);
}

function fileOperationFailed(filename, fileElem) {
	fileElem.setStatus('Error');
	fileElem.setProgress(100);

	fileOperationCompleted(fileElem);

	createToastMessage(`File ${filename} wasn't able to be uploaded! Please, try again.`, true);
}

function fileOperationCompleted(fileElem) {
	fileElem.querySelectorAll('#stop-upload-button')[0].disabled = true;

	setTimeout(() => {
		deleteUploadingFileEntry(fileElem);
	}, 5000);
}

function fetchExistingFiles() {
	const fetchFailed = (e) => {
		if(e)
			console.error('Failed to load. Error: ', e);
		createToastMessage('Failed to load uploaded files!', true, false);
	};

	fetch(`./api/files`).then((res) => {
		if(!res.ok)
			return fetchFailed();

		return res.json();
	}).then((data) => {
		for(const file of data.files) {
			createExistingFileEntry(file.filename, file.ident, file.size, file.date, file.views);
		}
	}).catch(fetchFailed);
}

function setLoggedIn(user) {
	const userNameParts = user.name.split('#');
	userNameParts.pop();

	loggedInInformation.querySelectorAll('#name-field')[0].innerHTML = userNameParts.join('#');
	const avatar = loggedInInformation.querySelectorAll('#avatar-field')[0];
	avatar.setAttribute('src', `https://cdn.discordapp.com/avatars/${user.auth}/${user.avatar}`);
	avatar.classList.remove('d-none');
	loggedInInformation.querySelectorAll('#dropdown-name-field')[0].innerHTML = user.name;
	loggedInInformation.querySelectorAll('#dropdown-login-button')[0].classList.add('d-none');
	loggedInInformation.querySelectorAll('#dropdown-logout-button')[0].classList.remove('d-none');
}

function setLoggedInAnonymously(user) {
	const randomDigit = parseInt(user.section[user.section.length - 1], 16) % 5;

	loggedInInformation.querySelectorAll('#name-field')[0].innerHTML = 'Anonymous';
	const avatar = loggedInInformation.querySelectorAll('#avatar-field')[0];
	avatar.setAttribute('src', `https://cdn.discordapp.com/embed/avatars/${randomDigit}.png`);
	avatar.classList.remove('d-none');
	loggedInInformation.querySelectorAll('#dropdown-name-field')[0].innerHTML = 'Anonymous';
}

function updateLoginUrls() {
	loggedInInformation.querySelectorAll('#dropdown-login-button')[0].setAttribute('href', `./api/auth/discord`);
	loggedInInformation.querySelectorAll('#dropdown-logout-button')[0].setAttribute('href', `./api/auth/logout`);
}

function isLoggedIn() {
	return authedAs && authedAs.auth;
}

async function checkLoggedInStatus() {
	try {
		authedAs = JSON.parse(window.atob(getCookie('sessdata')));
	}
	catch(e) {
		// Ugly hack to wait until cookies are set
		authedAs = await new Promise((resolve, reject) => {
			const inter = setInterval(() => {
				try {
					const auth = JSON.parse(window.atob(getCookie('sessdata')));
					clearInterval(inter);
					resolve(auth);
				}
				catch(e) { }
			}, 10);
		})
	}

	if(isLoggedIn())
		setLoggedIn(authedAs);
	else if(authedAs)
		setLoggedInAnonymously(authedAs);
}

let documentLoaded = false;

document.addEventListener("DOMContentLoaded", function(event) {
	if(documentLoaded)
		return;
	
	documentLoaded = true;

	fetchExistingFiles();
	checkLoggedInStatus();
});

updateLoginUrls();

// External code

// https://stackoverflow.com/questions/400212/how-do-i-copy-to-the-clipboard-in-javascript
function fallbackCopyTextToClipboard(text) {
	const textArea = document.createElement("textarea");
	textArea.value = text;
	
	textArea.style.top = "0";
	textArea.style.left = "0";
	textArea.style.position = "fixed";
	
	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();
	
	let status = false;

	try {
		status = document.execCommand('copy');
	} catch (err) { }

	document.body.removeChild(textArea);

	return status;
}

// https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string
function humanFileSize(bytes, si=false, dp=1) {
	const thresh = si ? 1000 : 1024;
	
	if (Math.abs(bytes) < thresh) {
	  return bytes + ' B';
	}
	
	const units = si 
	  ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
	  : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
	let u = -1;
	const r = 10**dp;
	
	do {
	  bytes /= thresh;
	  ++u;
	} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
	
	
	return bytes.toFixed(dp) + ' ' + units[u];
}

// https://stackoverflow.com/questions/10730362/get-cookie-by-name
function getCookie(name) {
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop().split(';').shift();
}