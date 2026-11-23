# Design vs UI Diff

Plugin Figma so sánh một node thiết kế với ảnh chụp màn hình UI thật trên thiết bị di động, rồi đánh dấu các điểm khác biệt ngay trên canvas Figma. Không cần build, không phụ thuộc npm, không dùng mạng.

## Cài đặt

1. Mở Figma desktop.
2. Vào **Plugins → Development → Import plugin from manifest…**
3. Chọn file `manifest.json` trong thư mục này.
4. Chạy plugin qua **Plugins → Development → Design vs UI Diff**.

## Cách dùng

1. Chọn frame cần so sánh trên canvas (hoặc dán Node ID / link Figma có `node-id=…` vào ô "Node ID or link" rồi bấm **Use**).
2. Thêm ảnh chụp UI: kéo thả, bấm vào vùng tải ảnh, hoặc dán từ clipboard (Cmd/Ctrl+V).
3. Chọn preset thanh hệ thống (status bar / nav bar) hoặc nhập tay số pt cần cắt.
4. Bấm **Compare** để xem các nhóm lỗi ưu tiên.
5. Xem kết quả ở 3 chế độ: *Side by side*, *Overlay* (có thanh độ mờ), *Diff*. Bấm vào một dòng trong danh sách để chọn node tương ứng trên Figma (hoặc zoom tới vùng đó).
6. **Mark on Figma** tạo frame “Actual UI” cạnh thiết kế, chứa ảnh chụp đầy đủ và ghi chú tiếng Việt. Mỗi mũi tên chỉ vào vị trí cần kiểm tra trên ảnh. **Clear marks** xoá frame ghi chú của node đang chọn.
7. **Export PNG** tải ảnh diff kèm khung và số; **Export JSON** tải báo cáo (thông tin node, cài đặt, kích thước ảnh, % khác biệt, các vùng với toạ độ theo đơn vị thiết kế và node khớp).

## Nhóm lỗi

- **Spacing**: lấy vị trí và tên component từ Figma, so các khối UI kề nhau từ trên xuống trước, rồi so trái sang phải giữa các phần tử cùng hàng. Phép so áp dụng cả cho frame, group và các layer ở group khác nhau. Icon được loại khỏi phép đo spacing. Chỉ báo khi chênh hơn 3 px sau khi căn ảnh theo chiều rộng thiết kế. Frame Actual UI tô đỏ vùng spacing với opacity 10% trên toàn bộ bề ngang hoặc chiều cao của cặp container và ghi khoảng cách gốc cùng tên hai component.
- **Kích thước**: ước lượng chênh lệch kích thước icon, nút, cỡ chữ và độ đậm của tiêu đề từ hình ảnh. Ghi chú lấy kích thước, cỡ chữ hoặc độ đậm gốc trực tiếp từ Figma.
- **UI icon**: so hình thức hiển thị của icon với Figma sau khi căn vị trí. Ghi chú khi ảnh cho thấy khác biệt về hình dạng, nét hoặc màu.
- **Padding**: so khoảng cách từ mép trái/trên/dưới của card (layer có nền) tới nội dung ngoài cùng bên trong. Báo khi chênh hơn 3 px, ghi chú nêu padding gốc.
- **Màu sắc**: so màu chữ (màu nét chữ đậm nhất) và màu nền card (trung vị, đã trừ phần bo góc) với thiết kế. Ghi chú nêu mã màu gốc và mã màu thực tế.
- **Thiếu phần tử**: tiêu đề, chữ, icon hoặc nút không tìm thấy và vị trí dự kiến trên ảnh trống. Chỉ báo phần tử ngoài cùng, không báo lại các layer con.
- **Thứ tự**: hai nội dung trong cùng container bị đảo vị trí (ví dụ hai hàng đổi chỗ). Các lệch spacing bên trong hai khối bị đảo được gộp vào lỗi này.
- **Bo góc**: so độ phủ ở 4 góc của card với thiết kế; chỉ kiểm tra khi card tương phản đủ với nền xung quanh.
- **Nội dung**: chỉ gợi ý kiểm tra tiêu đề màn hình, tên nút, nhãn icon và tiêu đề card/section có dấu hiệu hiển thị khác. Báo cáo đưa nội dung gốc từ Figma để lập trình viên đối chiếu. Tiêu đề được suy đoán từ tên layer, quan hệ cha–con và kiểu chữ.

## Bỏ qua layer

- Các cây layer danh sách/bảng được nhận diện theo tên. Các hàng lặp theo chiều dọc có cùng tên, kích thước và vị trí ngang cũng được bỏ qua. Plugin vẫn có thể dùng mép trên của vùng danh sách có nền để kiểm tra khoảng cách với khối phía trên. Layer không ghép được không tạo lỗi thiếu nội dung.

- Layer có fill ảnh/video/GIF tự động bị bỏ qua (bật/tắt bằng *Ignore image/video layers*); layer con của layer bị bỏ qua cũng bị bỏ qua.
- Bấm **Ignore** ở một dòng kết quả để bỏ qua thủ công node đó; danh sách *Ignored* hiển thị bên dưới, bấm × để bỏ chọn. Danh sách được lưu theo file và node đích.
- Vùng bị bỏ qua không tính vào % khác biệt và hiện màu xanh nhạt trong ảnh Diff.

## Ý nghĩa các thiết lập

**Crop (đơn vị pt)**
- *Status bar / Nav bar*: chiều cao thanh trạng thái và thanh điều hướng cần cắt khỏi ảnh chụp.
- *Design contains system bars*: bật nếu thiết kế cũng có các thanh này (cắt cùng số pt). Tắt thì nhập riêng số pt cần cắt ở phía trên/dưới của thiết kế.
- Hệ số tỉ lệ thiết bị được tự tính: `k = chiều rộng ảnh chụp / chiều rộng thiết kế`, nên số px cần cắt trên ảnh chụp = pt × k.

**Settings**
- *Threshold* (0–1, mặc định 0.1): ngưỡng khác biệt màu; càng nhỏ càng nhạy.
- *Ignore anti-aliasing*: bỏ qua các điểm ảnh khác biệt do làm mịn viền (hiển thị màu vàng trong ảnh diff).
- *Search range (pt)* (mặc định 48): phạm vi tìm vị trí khớp theo chiều dọc và ngang.
- *Match tolerance* (mặc định 25, thang 0–100): mức sai khác hình dạng tối đa để coi là khớp, tính bằng (1 − tương quan chuẩn hoá) × 100 trên ảnh xám đã làm mờ nhẹ. Tăng lên nếu báo nhầm nhiều, giảm xuống nếu bỏ sót. Icon và nhóm vector nhỏ được so như một khối, không so từng vector con.
- *Export scale* (1/2/3): độ phân giải khi xuất thiết kế để so sánh; cao hơn thì chính xác hơn nhưng chậm hơn.

## Lưu ý

- Ảnh chụp không cung cấp giá trị CSS, độ đậm thực tế hoặc chuỗi ký tự. Kiểm tra cỡ chữ, độ đậm và nội dung dựa trên đối chiếu hình ảnh. Layer có tên như `Screen Title`, `Button`, `Icon`, `List` và `Description` giúp plugin phân loại đúng hơn.
- Ảnh chụp có chiều rộng nhỏ hơn bản thiết kế đã xuất (ví dụ ảnh chụp qua chat bị nén) sẽ hiện cảnh báo độ phân giải thấp. Plugin hạ độ phân giải thiết kế tương ứng để giảm báo nhầm, nhưng nên dùng ảnh chụp gốc từ thiết bị.
- **Diff** xác nhận có pixel khác biệt gần vùng spacing hoặc kích thước trước khi plugin ghi chú. Plugin phân loại nguyên nhân theo phép đo hình học. Ghi chú trên Actual UI dùng thông số gốc từ Figma. Lỗi ở nửa trái đặt note bên trái, lỗi từ giữa ảnh sang phải đặt note bên phải. Diff vẫn có thể hiển thị các khác biệt màu hoặc chi tiết phụ.

## Kiểm thử hồi quy

`test/harness.html` chạy `ui.html` trong iframe với bản thiết kế xuất sẵn (`test/fixtures/export.json`, `design@2x.png`) và các ảnh chụp có lỗi cài sẵn, rồi chấm điểm báo cáo JSON (bắt đúng, sai loại, bỏ sót, báo nhầm).

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

Mở `http://127.0.0.1:8766/test/harness.html` và chạy `await H.runAll()` trong console.
