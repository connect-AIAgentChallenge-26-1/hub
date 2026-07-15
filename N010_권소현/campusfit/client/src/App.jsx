import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Main from "./pages/Main";
import CategoryList from "./pages/CategoryList";
import ListingDetail from "./pages/ListingDetail";
import Board from "./pages/Board";
import PostDetail from "./pages/PostDetail";
import WriteBoardPost from "./pages/WriteBoardPost";
import Bookmarks from "./pages/Bookmarks";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Main />} />
          <Route path="category/:categoryId" element={<CategoryList />} />
          <Route path="listing/:listingId" element={<ListingDetail />} />
          <Route path="board" element={<Board />} />
          <Route path="board/listing/:listingId" element={<Board />} />
          <Route path="board/listing/:listingId/write" element={<WriteBoardPost />} />
          <Route path="board/post/:postId" element={<PostDetail />} />
          <Route path="bookmarks" element={<Bookmarks />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App
