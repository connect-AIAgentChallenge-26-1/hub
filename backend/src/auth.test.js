const fs = require('fs');
const path = require('path');

// Clean up test user in users.json before requiring app to avoid duplicate registration errors
const usersFilePath = path.join(__dirname, '../users.json');
if (fs.existsSync(usersFilePath)) {
  try {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    let users = JSON.parse(data);
    users = users.filter(u => u.studentId !== '2021012345');
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {}
}

const request = require('supertest');
const app = require('./app');

describe('Authentication API (TDD)', () => {
  describe('POST /api/auth/signup', () => {
    it('should return 400 if studentId is missing', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: '홍길동',
          password: 'password123',
          studentType: 'general',
          department: '컴퓨터공학과'
        });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toEqual('학번과 비밀번호는 필수 입력 항목입니다.');
    });

    it('should register a new user successfully and return 201', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          studentId: '2021012345',
          name: '홍길동',
          password: 'password123',
          studentType: 'general',
          department: '컴퓨터공학과',
          email: 'hong@gnu.ac.kr'
        });
      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toEqual(true);
      expect(res.body.user.name).toEqual('홍길동');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate user and return 200 with user data', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          studentId: '2021012345',
          password: 'password123'
        });
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.user.name).toEqual('홍길동');
    });

    it('should return 401 for incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          studentId: '2021012345',
          password: 'wrongpassword'
        });
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toEqual('비밀번호가 일치하지 않습니다.');
    });
  });
});
