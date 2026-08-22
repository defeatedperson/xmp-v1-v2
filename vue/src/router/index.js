import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/dashboard/MainView.vue'),
      meta: { title: '仪表盘' },
    },
    {
      path: '/website',
      name: 'website',
      component: () => import('../views/website/MainView.vue'),
      meta: { title: '网站' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/login/LoginPage.vue'),
      meta: { hideLayout: true, title: '登录' },
    },
    {
      path: '/database',
      name: 'database',
      component: () => import('../views/database/MainView.vue'),
      meta: { title: '数据库' },
    },
    {
      path: '/node',
      name: 'node',
      component: () => import('../views/node/MainView.vue'),
      meta: { title: '节点' },
    },
    {
      path: '/file',
      name: 'file',
      component: () => import('../views/file/MainView.vue'),
      meta: { title: '文件' },
    },
    {
      path: '/xcapp',
      name: 'xcapp',
      component: () => import('../views/xcapp/MainView.vue'),
      meta: { title: 'XCC' },
    },
    {
      path: '/app',
      name: 'app',
      component: () => import('../views/app/MainView.vue'),
      meta: { title: '商店' },
    },
    {
      path: '/ssh',
      name: 'ssh',
      component: () => import('../views/ssh/MainView.vue'),
      meta: { title: 'SSH' },
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: () => import('../views/task/MainView.vue'),
      meta: { title: '任务' },
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../views/log/MainView.vue'),
      meta: { title: '日志' },
    },
    {
      path: '/set',
      name: 'settings',
      component: () => import('../views/set/MainView.vue'),
      meta: { title: '设置' },
    }
  ],
})

router.afterEach((to) => {
  const title = to.meta?.title
  if (title) {
    document.title = title
  }
})

export default router
