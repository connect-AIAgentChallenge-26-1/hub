import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { toast } from 'sonner'

const loginSchema = z.object({
  email: z.string().email('이메일 형식이 아닙니다'),
  password: z.string().min(6, '비밀번호는 6 자 이상입니다'),
})

type LoginForm = z.infer<typeof loginSchema>

const Login = () => {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (_data: LoginForm) => {
    setIsLoading(true)
    // TODO: BE 세션이 Firebase Auth 연동
    await new Promise((resolve) => setTimeout(resolve, 1000)) // mock delay
    toast.success('로그인되었습니다')
    navigate('/dashboard')
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ShowUp</h1>
          <p className="text-gray-500 mt-2">소상공인 고객 이력 관리</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="이메일"
            type="email"
            placeholder="example@email.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="비밀번호"
            type="password"
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password')}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            계정이 없으신가요?{' '}
            <Link to="/register" className="text-blue-600 hover:underline font-medium">
              회원가입
            </Link>
          </p>
        </div>

        <div className="mt-8 flex justify-center gap-4 text-xs text-gray-400">
          <Link to="/privacy" className="hover:underline">
            개인정보처리방침
          </Link>
          <Link to="/terms" className="hover:underline">
            이용약관
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login
