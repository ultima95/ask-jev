# jev-ask

Hỏi [Jev](https://typesafe.ai) trước khi hỏi bạn.

Claude Code dừng lại hỏi bạn (`AskUserQuestion`) cả những câu mà đáp án đã nằm
sẵn trong cuộc hội thoại. Plugin này chặn câu hỏi đó lại, đưa cho Jev — một model
đánh giá trả về xác suất thay vì chữ — và tự trả lời khi đáp án suy ra được.

Câu nào thuộc về bạn thì vẫn tới bạn.

```
"Dùng thư viện nào để parse ngày?"     → tự chọn date-fns (1.00)   — đã có trong package.json
"Đóng gói thành plugin hay skill?"     → tự chọn Plugin  (0.95)
"Bạn muốn giao diện tông màu nào?"     → hỏi bạn                   — sở thích
"Có xoá luôn 3 environment cũ không?"  → hỏi bạn                   — không hoàn tác được
```

## Cài

```bash
git clone <repo> ~/workspace/jev-ask
```

```
/plugin marketplace add ~/workspace/jev-ask
/plugin install jev-ask@jev-ask
```

Rồi đặt khoá Vercel AI Gateway (có Jev trong danh mục model):

```bash
echo 'vck_...' > ~/.claude/jev-ask.key && chmod 600 ~/.claude/jev-ask.key
```

Hoặc dùng biến môi trường `AI_GATEWAY_API_KEY` nếu bạn đã có sẵn.

Không khoá = plugin nằm im, Claude Code hỏi bạn như thường.

## Nó quyết thế nào

Mỗi câu hỏi là **một** request Jev với **hai** câu hỏi:

- `pick` — phương án nào đúng, kèm phân phối xác suất
- `personal` — *câu hỏi này có được phép tự quyết không*

Câu thứ hai mới là phần quan trọng. Thiếu nó, Jev sẽ tự tin chọn giúp bạn cả
tông màu thương hiệu lẫn việc xoá thư mục — sai không phải về sự thật mà về
thẩm quyền. `personal` chặn sở thích, đánh đổi phụ thuộc mục tiêu riêng, và mọi
việc không hoàn tác được, kể cả khi `pick` rất chắc.

## Khi nào nó im lặng

| Điều kiện | Vì sao |
|---|---|
| `personal > 0.5` | quyền của bạn, không phải của model |
| độ chắc `< JEV_ASK_THRESHOLD` | đoán mò thì thà hỏi |
| câu hỏi `multiSelect` | một lựa chọn sai kéo theo cả chùm |
| nhiều câu mà chỉ chắc vài câu | trả lời nửa chừng vẫn phải hỏi lại, mà bạn đã mất một lựa chọn |
| không khoá / Jev lỗi / quá 8s | hỏng thì không được chặn bạn trả lời |

## Cấu hình

| Biến | Mặc định | |
|---|---|---|
| `AI_GATEWAY_API_KEY` | `~/.claude/jev-ask.key` | khoá Vercel AI Gateway |
| `JEV_ASK_THRESHOLD` | `0.8` | hạ xuống = tự quyết nhiều hơn, sai nhiều hơn |
| `JEV_MODEL` | `typesafe-ai/jev` | |
| `JEV_GATEWAY_URL` | endpoint đánh giá của Vercel | |

## Ghi chú kỹ thuật

Không phụ thuộc npm — chỉ `fetch` và `fs` của Node. Gọi thẳng endpoint đánh giá
của gateway nên không cần `npm install`, không có `node_modules`, cài là chạy.

Claude Code không cho hook trả về tool result giả. Nhưng `PreToolUse` với
`permissionDecision: "deny"` thì `permissionDecisionReason` **được đưa ngược vào
model** — nên "trả lời thay bạn" ở đây thực chất là *chặn câu hỏi + nói cho model
biết đáp án*. Trong phiên bạn sẽ thấy một dòng `Jev answered: ...` rồi model đi tiếp.

Ngữ cảnh lấy từ 12 lượt gần nhất của transcript phiên (bỏ lượt subagent và lượt
máy sinh), cắt còn 6000 ký tự. Khoảng $0.00002 và ~0.7s mỗi câu hỏi.
