class PhotoBoothApp {
    constructor() {
        this.currentPage = 1;
        this.video = null;
        this.canvas = null;
        this.overlay = null;
        this.model = null;
        this.selectedBackground = 0;
        this.capturedPhotos = {
            photo1: null,
            photo2: null
        };
        this.isCapturing = false;

        this.init();
    }

    async init() {
        this.setTodayDate();
        this.setupEventListeners();
        await this.initializeCamera();
        await this.loadFaceDetectionModel();
        this.setupBackgroundSelection();
    }

    setTodayDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('today-date').value = today;
    }

    setupEventListeners() {
        const captureBtn = document.getElementById('capture-btn');
        const printBtn = document.getElementById('print-btn');

        captureBtn.addEventListener('click', () => this.startCountdown());
        printBtn.addEventListener('click', () => goToPage(3));

        printBtn.disabled = true;
        printBtn.style.opacity = '0.5';
        printBtn.style.cursor = 'not-allowed';

        // 사진 선택 버튼 이벤트 리스너 추가
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('select-btn')) {
                const photoId = e.target.getAttribute('for');
                document.getElementById(photoId).checked = true;
                this.selectAndPrintPhoto(photoId.replace('radio', 'photo'));
            }
        });
    }

    setupBackgroundSelection() {
        const bgButtons = document.querySelectorAll('.bg-btn');
        bgButtons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                bgButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedBackground = index;
            });
        });
    }

    async initializeCamera() {
        try {
            this.video = document.getElementById('video');
            this.overlay = document.getElementById('overlay');

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1080 },
                    height: { ideal: 1920 },
                    facingMode: 'user'
                }
            });

            this.video.srcObject = stream;
            this.video.addEventListener('loadedmetadata', () => {
                this.startFaceDetection();
            });

        } catch (error) {
            console.error('카메라 접근 오류:', error);
            alert('카메라에 접근할 수 없습니다. 카메라 권한을 허용해주세요.');
        }
    }

    async loadFaceDetectionModel() {
        try {
            await tf.ready();
            this.model = await faceLandmarksDetection.load(
                faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
                { maxFaces: 5 }
            );
            console.log('얼굴 인식 모델 로드 완료');
        } catch (error) {
            console.error('모델 로드 오류:', error);
        }
    }

    async startFaceDetection() {
        if (!this.model || !this.video) return;

        const detectFaces = async () => {
            if (this.video.readyState === 4) {
                const predictions = await this.model.estimateFaces({
                    input: this.video,
                    returnTensors: false,
                    flipHorizontal: false,
                });

                this.drawOverlay(predictions);
            }
            requestAnimationFrame(detectFaces);
        };

        detectFaces();
    }

    drawOverlay(faces) {
        if (!this.overlay) return;

        const ctx = this.overlay.getContext('2d');
        ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

        faces.forEach(face => {
            this.applyFilter(ctx, face, this.selectedBackground);
        });
    }

    applyFilter(ctx, face, filterType) {
        if (!face.scaledMesh) return;

        const landmarks = face.scaledMesh;

        // MediaPipe FaceMesh 468 포인트 기반 정확한 얼굴 좌표
        const facePoints = {
            // 눈 좌표 (더 정확한 눈 중심)
            leftEye: this.getEyeCenter(landmarks, [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]),
            rightEye: this.getEyeCenter(landmarks, [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]),

            // 코 좌표
            noseTip: landmarks[1],      // 코끝
            noseBridge: landmarks[6],   // 코 중간
            noseBase: landmarks[2],     // 코 밑

            // 입술 좌표
            upperLip: landmarks[13],    // 윗입술 중앙
            lowerLip: landmarks[14],    // 아랫입술 중앙
            leftMouth: landmarks[61],   // 입 왼쪽
            rightMouth: landmarks[291], // 입 오른쪽

            // 볼 좌표
            leftCheek: landmarks[116],  // 왼쪽 볼
            rightCheek: landmarks[345], // 오른쪽 볼

            // 이마와 턱 좌표
            forehead: landmarks[10],    // 이마 중앙
            chin: landmarks[152],       // 턱 끝

            // 얼굴 윤곽
            leftJaw: landmarks[172],    // 왼쪽 턱선
            rightJaw: landmarks[397],   // 오른쪽 턱선

            // 눈썹 좌표
            leftEyebrow: landmarks[70], // 왼쪽 눈썹
            rightEyebrow: landmarks[300] // 오른쪽 눈썹
        };

        ctx.save();

        switch (filterType) {
            case 0: // 꼬깔콘
                this.drawPartyHat(ctx, facePoints.forehead, facePoints.noseTip, facePoints.leftEye, facePoints.rightEye);
                break;
            case 1: // 부끄럼 표시
                this.drawBlush(ctx, facePoints.leftCheek, facePoints.rightCheek, facePoints.leftEye, facePoints.rightEye);
                break;
            case 2: // 왕관
                this.drawCrown(ctx, facePoints.forehead, facePoints.leftEye, facePoints.rightEye, facePoints.leftEyebrow, facePoints.rightEyebrow);
                break;
            case 3: // 마스크
                this.drawMask(ctx, facePoints.leftEye, facePoints.rightEye, facePoints.noseTip, facePoints.upperLip, facePoints.chin);
                break;
        }

        ctx.restore();
    }

    // 눈 중심점 계산 (여러 포인트의 평균)
    getEyeCenter(landmarks, eyePoints) {
        let sumX = 0, sumY = 0;
        eyePoints.forEach(pointIndex => {
            sumX += landmarks[pointIndex][0];
            sumY += landmarks[pointIndex][1];
        });
        return [sumX / eyePoints.length, sumY / eyePoints.length];
    }

    drawPartyHat(ctx, forehead, noseTip, leftEye, rightEye) {
        // 얼굴 크기에 비례하여 모자 크기 계산
        const faceWidth = Math.abs(rightEye[0] - leftEye[0]);
        const hatWidth = faceWidth * 1.2;
        const hatHeight = hatWidth * 1.3;

        const centerX = forehead[0];
        const centerY = forehead[1] - hatHeight * 0.3;

        // 그라디언트 배경
        const gradient = ctx.createLinearGradient(centerX, centerY - hatHeight, centerX, centerY);
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(1, '#e74c3c');

        // 꼬깔콘 그리기
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - hatHeight);
        ctx.lineTo(centerX - hatWidth/2, centerY);
        ctx.lineTo(centerX + hatWidth/2, centerY);
        ctx.closePath();
        ctx.fill();

        // 테두리
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 폼폼 그리기
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY - hatHeight, hatWidth * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ecf0f1';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 패턴 점들
        ctx.fillStyle = '#ffffff';
        const dotCount = Math.floor(hatWidth / 40);
        for (let i = 0; i < dotCount; i++) {
            const x = centerX - hatWidth/3 + (i * hatWidth/dotCount * 0.6);
            const y = centerY - hatHeight * 0.3 + (i * 15);
            ctx.beginPath();
            ctx.arc(x, y, hatWidth * 0.03, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawBlush(ctx, leftCheek, rightCheek, leftEye, rightEye) {
        // 얼굴 크기에 비례한 블러시 크기
        const faceWidth = Math.abs(rightEye[0] - leftEye[0]);
        const blushSize = faceWidth * 0.15;

        // 그라디언트 블러시
        const leftGradient = ctx.createRadialGradient(
            leftCheek[0], leftCheek[1], 0,
            leftCheek[0], leftCheek[1], blushSize
        );
        leftGradient.addColorStop(0, 'rgba(255, 182, 193, 0.8)');
        leftGradient.addColorStop(0.7, 'rgba(255, 182, 193, 0.4)');
        leftGradient.addColorStop(1, 'rgba(255, 182, 193, 0)');

        const rightGradient = ctx.createRadialGradient(
            rightCheek[0], rightCheek[1], 0,
            rightCheek[0], rightCheek[1], blushSize
        );
        rightGradient.addColorStop(0, 'rgba(255, 182, 193, 0.8)');
        rightGradient.addColorStop(0.7, 'rgba(255, 182, 193, 0.4)');
        rightGradient.addColorStop(1, 'rgba(255, 182, 193, 0)');

        // 왼쪽 볼 블러시
        ctx.fillStyle = leftGradient;
        ctx.beginPath();
        ctx.ellipse(leftCheek[0], leftCheek[1], blushSize, blushSize * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 오른쪽 볼 블러시
        ctx.fillStyle = rightGradient;
        ctx.beginPath();
        ctx.ellipse(rightCheek[0], rightCheek[1], blushSize, blushSize * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 하이라이트 효과
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(leftCheek[0] - blushSize*0.3, leftCheek[1] - blushSize*0.2, blushSize*0.3, blushSize*0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(rightCheek[0] - blushSize*0.3, rightCheek[1] - blushSize*0.2, blushSize*0.3, blushSize*0.2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    drawCrown(ctx, forehead, leftEye, rightEye) {
        const centerX = forehead[0];
        const centerY = forehead[1] - 80;
        const crownWidth = Math.abs(rightEye[0] - leftEye[0]) + 60;

        // 왕관 베이스
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(centerX - crownWidth/2, centerY, crownWidth, 40);

        // 왕관 뾰족한 부분들
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const x = centerX - crownWidth/2 + (crownWidth/4) * i;
            const height = i === 2 ? 60 : 40; // 가운데가 가장 높음
            ctx.moveTo(x, centerY);
            ctx.lineTo(x + crownWidth/8, centerY - height);
            ctx.lineTo(x + crownWidth/4, centerY);
        }
        ctx.fill();

        // 보석들
        ctx.fillStyle = '#ff0000';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(centerX - 40 + i * 40, centerY + 20, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawMask(ctx, leftEye, rightEye, noseTip) {
        const centerX = (leftEye[0] + rightEye[0]) / 2;
        const centerY = (leftEye[1] + rightEye[1]) / 2;
        const maskWidth = Math.abs(rightEye[0] - leftEye[0]) + 100;
        const maskHeight = 60;

        // 마스크 배경
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, maskWidth/2, maskHeight/2, 0, 0, Math.PI * 2);
        ctx.fill();

        // 마스크 테두리
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 4;
        ctx.stroke();

        // 눈 구멍
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(leftEye[0], leftEye[1], 25, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(rightEye[0], rightEye[1], 25, 20, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    async startCountdown() {
        if (this.isCapturing) return;

        this.isCapturing = true;
        const countdownEl = document.getElementById('countdown');

        for (let i = 3; i > 0; i--) {
            countdownEl.textContent = i;
            countdownEl.classList.add('show');

            if (i === 1) {
                // 1초 전 사진 캡처
                setTimeout(() => {
                    this.capturePhoto('photo1');
                }, 500);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            countdownEl.classList.remove('show');
        }

        // 최종 사진 캡처
        this.capturePhoto('photo2');

        // 인쇄 버튼 활성화
        const printBtn = document.getElementById('print-btn');
        printBtn.disabled = false;
        printBtn.style.opacity = '1';
        printBtn.style.cursor = 'pointer';

        this.isCapturing = false;
    }

    capturePhoto(photoId) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = 1080;
        canvas.height = 1920;

        // 비디오 그리기 (좌우반전)
        ctx.scale(-1, 1);
        ctx.drawImage(this.video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.scale(-1, 1);

        // 오버레이 그리기
        ctx.drawImage(this.overlay, 0, 0);

        // 데이터 URL로 저장
        this.capturedPhotos[photoId] = canvas.toDataURL('image/png');

        console.log(`${photoId} 캡처 완료`);
    }

    printSelectedPhoto() {
        const selectedRadio = document.querySelector('input[name="photo-select"]:checked');
        if (!selectedRadio) {
            alert('인쇄할 사진을 선택해주세요.');
            return;
        }

        const selectedPhoto = this.capturedPhotos[selectedRadio.value];
        if (!selectedPhoto) {
            alert('선택한 사진이 없습니다.');
            return;
        }

        // 4페이지로 이동
        goToPage(4);

        // 4페이지에 선택된 사진 표시
        setTimeout(() => {
            this.displayPrintPhoto(selectedPhoto);
        }, 100);
    }

    selectAndPrintPhoto(photoId) {
        const selectedPhoto = this.capturedPhotos[photoId];
        if (!selectedPhoto) {
            alert('선택한 사진이 없습니다.');
            return;
        }

        // 4페이지로 이동
        goToPage(4);

        // 4페이지에 선택된 사진 표시
        setTimeout(() => {
            this.displayPrintPhoto(selectedPhoto);
        }, 100);
    }

    displayPrintPhoto(photoDataUrl) {
        const printCanvas = document.getElementById('print-photo');
        const ctx = printCanvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
            // 캔버스 크기에 맞게 이미지 그리기
            ctx.drawImage(img, 0, 0, printCanvas.width, printCanvas.height);
        };
        img.src = photoDataUrl;
    }
}

// 페이지 네비게이션 함수
function goToPage(pageNum) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    document.getElementById(`page${pageNum}`).classList.add('active');

    if (pageNum === 3) {
        displayCapturedPhotos();
    } else if (pageNum === 4) {
        // 4페이지로 직접 이동할 때는 기본적으로 photo2를 표시
        if (window.photoBoothApp && window.photoBoothApp.capturedPhotos.photo2) {
            setTimeout(() => {
                window.photoBoothApp.displayPrintPhoto(window.photoBoothApp.capturedPhotos.photo2);
            }, 100);
        }
    }
}

function displayCapturedPhotos() {
    if (window.photoBoothApp) {
        const photo1Canvas = document.getElementById('photo1');
        const photo2Canvas = document.getElementById('photo2');

        if (window.photoBoothApp.capturedPhotos.photo1) {
            const ctx1 = photo1Canvas.getContext('2d');
            const img1 = new Image();
            img1.onload = () => {
                ctx1.drawImage(img1, 0, 0, photo1Canvas.width, photo1Canvas.height);
            };
            img1.src = window.photoBoothApp.capturedPhotos.photo1;
        }

        if (window.photoBoothApp.capturedPhotos.photo2) {
            const ctx2 = photo2Canvas.getContext('2d');
            const img2 = new Image();
            img2.onload = () => {
                ctx2.drawImage(img2, 0, 0, photo2Canvas.width, photo2Canvas.height);
            };
            img2.src = window.photoBoothApp.capturedPhotos.photo2;
        }
    }
}

// 인쇄 매수 조절 함수
function changePrintQuantity(change) {
    const printCountInput = document.getElementById('print-count');
    let currentValue = parseInt(printCountInput.value);
    let newValue = currentValue + change;

    if (newValue >= 1 && newValue <= 10) {
        printCountInput.value = newValue;
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    window.photoBoothApp = new PhotoBoothApp();
});