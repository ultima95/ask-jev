<p align="center"><img src="./assets/logo.jpg" alt="ask-jev logo" width="200"></p>

<h1 align="center">ask-jev</h1>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-2dd4bf?style=flat-square">
  <img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-1abc9c?style=flat-square">
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-none-2dd4bf?style=flat-square">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D18-1abc9c?style=flat-square">
</p>

<p align="center"><a href="./README.md">English</a> · <strong>Tiếng Việt</strong></p>

**Hỏi [Jev](https://typesafe.ai) trước khi hỏi bạn.**

Claude Code hay dừng lại hỏi bạn (`AskUserQuestion`) cả những câu mà đáp án đã
nằm sẵn trong cuộc hội thoại. ask-jev chặn câu hỏi đó lại, đưa cho Jev — một
model nhỏ, nhanh, chuyên phán đoán thay vì trò chuyện, trả về xác suất thay vì
chữ — và tự trả lời khi đáp án rõ ràng suy ra được.

Câu nào thật sự thuộc về bạn thì vẫn tới tay bạn, y như cũ.

```
"Dùng thư viện nào để parse ngày?"     → tự chọn date-fns (1.00)   — đã có trong package.json
"Đóng gói thành plugin hay skill?"     → tự chọn Plugin  (0.95)
"Bạn muốn giao diện tông màu nào?"     → hỏi bạn                   — sở thích
"Có xoá luôn 3 environment cũ không?"  → hỏi bạn                   — không hoàn tác được
```

## Cài đặt

1. Thêm marketplace rồi cài plugin:

   ```
   /plugin marketplace add yanmad27/ask-jev
   /plugin install ask-jev@ask-jev
   ```

2. Đặt khoá Vercel AI Gateway (Jev nằm trong danh mục model của Vercel):

   ```bash
   echo 'vck_...' > ~/.claude/ask-jev.key && chmod 600 ~/.claude/ask-jev.key
   ```

   Đã có sẵn khoá gateway? Dùng biến môi trường `AI_GATEWAY_API_KEY` thay thế
   — không cần tạo file.

Vậy là xong. **Không đặt khoá →** plugin nằm im, Claude Code hỏi bạn như bình
thường. Không có gì bị ảnh hưởng.

## Cách nó hoạt động

Trước khi Claude Code hiện câu hỏi cho bạn, ask-jev gửi câu đó cho Jev để
phán hai việc:

1. **Đây có phải chuyện của bạn không?** Sở thích, ưu tiên riêng, hay bất kỳ
   việc gì không hoàn tác được (xoá, gửi, publish, tốn tiền) — Jev không đụng
   vào, dù đáp án "đúng" có vẻ hiển nhiên đến đâu.
2. **Nếu không phải, phương án nào đúng** — dựa trên mọi thứ đã nói trong
   cuộc hội thoại?

Chỉ khi Jev vừa chắc chắn vừa xác định câu hỏi không phải chuyện riêng, Claude
mới nhận đáp án âm thầm rồi đi tiếp. Còn lại, câu hỏi tới tay bạn y hệt như
khi chưa cài ask-jev.

### Lựa chọn cần định nghĩa thật sự

Để Jev phán đoán được, mỗi lựa chọn cần một description **định nghĩa** nó —
không chỉ là cái nhãn. Lấy ví dụ "Đây có phải burger không?" với lựa chọn chỉ
ghi "Có": chẳng có gì để đối chiếu cả. "Có" cần một description kiểu *"Một
món ăn nóng: miếng thịt bằm nướng kẹp trong bánh mì tròn cắt đôi"* — thứ bạn
có thể cầm bằng chứng lên mà kiểm chứng được.

Thiếu description ở bất kỳ lựa chọn nào trong câu hỏi, ask-jev không gọi Jev
luôn — nó trả câu hỏi ngược lại cho Claude kèm hướng dẫn hỏi lại với định
nghĩa đầy đủ. Vòng đó không có gì tới tay bạn; Claude chỉ việc thử lại.

## Khi nào bạn vẫn bị hỏi

| Điều kiện | Vì sao |
|---|---|
| câu hỏi là chuyện riêng (`personal > 0.5`) | quyền của bạn, không phải của model |
| Jev không đủ chắc (`< JEV_ASK_THRESHOLD`) | đoán mò thì thà hỏi còn hơn |
| câu hỏi cho chọn nhiều đáp án (`multiSelect`) | một lựa chọn sai sẽ kéo theo cả chùm |
| nhiều câu hỏi cùng lúc, chỉ vài câu chắc | trả lời nửa chừng vẫn phải hỏi lại, mà bạn đã mất một lựa chọn vào tay một cú đoán sai |
| có lựa chọn thiếu description | nhãn trần không phải thứ Jev phán đoán được — trả về cho Claude, không đưa cho Jev |
| không có khoá, Jev lỗi, hoặc quá 8 giây | một helper hỏng không bao giờ được phép là lý do bạn không trả lời được |

## Cấu hình

Tất cả đều tuỳ chọn — mặc định đã hợp lý sẵn.

| Biến | Mặc định | |
|---|---|---|
| `AI_GATEWAY_API_KEY` | đọc `~/.claude/ask-jev.key` | khoá Vercel AI Gateway của bạn |
| `JEV_ASK_THRESHOLD` | `0.8` | hạ xuống để Jev tự trả lời nhiều hơn (và cũng sai nhiều hơn) |
| `JEV_MODEL` | `typesafe-ai/jev` | model nào Jev dùng để đánh giá |
| `JEV_GATEWAY_URL` | endpoint đánh giá của Vercel | chỉ cần đổi nếu dùng gateway riêng |

File khoá cũ `~/.claude/jev-ask.key` (từ trước khi plugin đổi tên) vẫn được
đọc như phương án dự phòng, nên không có gì hỏng nếu bạn từng đặt theo tên cũ.

## Tự hỏi Jev

Không chỉ tự trả lời `AskUserQuestion`, Claude còn có thể hỏi Jev cho *bất kỳ*
quyết định nào — phân loại, chọn phương án, có/không, chấm điểm — qua skill và
CLI đi kèm:

```
echo '{"state": ..., "questions": ...}' | node "${CLAUDE_PLUGIN_ROOT}/bin/jev.mjs"
```

Skill (`skills/ask-jev/SKILL.md`) giải thích thế nào là một request tốt —
bằng chứng dán nguyên vào `state`, mỗi câu hỏi một quyết định, tiêu chí quan
sát được và loại trừ lẫn nhau — kèm ví dụ cụ thể.

## Đóng góp / Sửa plugin

Đang phát triển plugin trên máy? Trỏ marketplace vào thư mục làm việc thay vì
GitHub, để sửa xong là chạy luôn, không phải push rồi update:

```
/plugin marketplace add ~/workspace/ask-jev
```

## Ghi chú triển khai

<details>
<summary>Hook thực sự chặn câu hỏi kiểu gì, và vì sao lại có thêm một hook bạn không bao giờ tự gọi</summary>

<br>

**Không phụ thuộc npm.** Chỉ dùng `fetch` và `fs` của Node, gọi thẳng endpoint
đánh giá của gateway. Clone về là chạy — không cần `npm install`, không có
`node_modules`.

**"Trả lời thay bạn" thực chất là một lần từ chối.** Claude Code không cho
hook trả về tool result giả. Nhưng `PreToolUse` hook trả về
`permissionDecision: "deny"` thì `permissionDecisionReason` được đưa thẳng
ngược vào model — nên "đáp án" của ask-jev thực chất là *chặn câu hỏi lại và
nói cho Claude biết đáp án*. Trong phiên bạn sẽ thấy một dòng
`Jev answered: ...` rồi Claude đi tiếp như thể chính bạn vừa gõ đáp án đó.

**Vì sao có thêm hook `SessionStart`.** Claude Code hiện không chạy
`PreToolUse` hook khai trong plugin
([anthropics/claude-code#36397](https://github.com/anthropics/claude-code/issues/36397))
— chỉ `SessionStart` từ plugin là chạy được. Nên `hooks/self-register.mjs`
chạy mỗi `SessionStart`, tự ghi entry `PreToolUse` thẳng vào
`~/.claude/settings.json` của bạn — nơi hook vẫn chạy bình thường — và tự cập
nhật lại đường dẫn mỗi khi plugin lên bản mới. Nó chỉ đụng đúng entry của
mình, phần còn lại của `settings.json` giữ nguyên. Khi nào upstream sửa xong
thì entry này thừa nhưng vô hại — tốn nhiều lắm là thêm một lần gọi gateway.

**Bên dưới**, mỗi lựa chọn được gửi cho Jev dạng `{what, not_for}` — `not_for`
nêu tên các lựa chọn anh em mà nó không được trùng, để các định nghĩa loại
trừ nhau chứ không chỉ đứng cạnh nhau.

**Ngữ cảnh** lấy từ 12 lượt gần nhất của transcript phiên (bỏ lượt subagent
và lượt máy sinh), cắt còn 6000 ký tự. Mỗi câu hỏi tốn khoảng $0.00002 và mất
chừng 0.7 giây.

</details>
