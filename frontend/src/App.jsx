import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Customerdash from './pages/Customerdash'
import Shopdash from './pages/Shopdash'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register/customer" element={<Register />} />
        <Route path="/register/owner" element={<Register />} />
        <Route 
          path='/customer/dashboard' 
          element={
            <ProtectedRoute allowedUserTypes={['customer']}>
              <Customerdash />
            </ProtectedRoute>
          }
        />
        <Route 
          path='/shop/dashboard' 
          element={
            <ProtectedRoute allowedUserTypes={['owner']}>
              <Shopdash />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App
